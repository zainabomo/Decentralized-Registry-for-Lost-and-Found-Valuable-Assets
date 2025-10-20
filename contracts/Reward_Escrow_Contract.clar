;; Reward Escrow Contract
;; Manages reward deposits, releases, and refunds for lost assets

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u200))
(define-constant ERR-NOT-FOUND (err u201))
(define-constant ERR-INSUFFICIENT-FUNDS (err u202))
(define-constant ERR-ALREADY-EXISTS (err u203))
(define-constant ERR-INVALID-AMOUNT (err u204))
(define-constant ERR-ESCROW-LOCKED (err u205))
(define-constant ERR-ESCROW-EXPIRED (err u206))

;; Escrow status constants
(define-constant ESCROW-STATUS-ACTIVE u1)
(define-constant ESCROW-STATUS-RELEASED u2)
(define-constant ESCROW-STATUS-REFUNDED u3)
(define-constant ESCROW-STATUS-DISPUTED u4)

;; Time constants (in blocks)
(define-constant ESCROW-TIMEOUT-BLOCKS u2016) ;; ~2 weeks (10 min per block)
(define-constant DISPUTE-WINDOW-BLOCKS u288)  ;; ~2 days

;; Data structures
(define-map escrows
  { asset-id: uint }
  {
    depositor: principal,
    beneficiary: (optional principal),
    amount: uint,
    status: uint,
    created-at: uint,
    expires-at: uint,
    released-at: (optional uint),
    dispute-deadline: (optional uint)
  }
)

(define-map dispute-records
  { asset-id: uint }
  {
    initiator: principal,
    reason: (string-ascii 200),
    created-at: uint,
    resolved: bool
  }
)

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var total-escrowed uint u0)

;; Read-only functions
(define-read-only (get-escrow (asset-id uint))
  (map-get? escrows { asset-id: asset-id })
)

(define-read-only (get-dispute (asset-id uint))
  (map-get? dispute-records { asset-id: asset-id })
)

(define-read-only (get-total-escrowed)
  (var-get total-escrowed)
)

(define-read-only (is-escrow-expired (asset-id uint))
  (match (map-get? escrows { asset-id: asset-id })
    escrow-data (> burn-block-height (get expires-at escrow-data))
    false
  )
)

(define-read-only (is-dispute-window-active (asset-id uint))
  (match (map-get? escrows { asset-id: asset-id })
    escrow-data (match (get dispute-deadline escrow-data)
      deadline (<= burn-block-height deadline)
      false
    )
    false
  )
)

;; Private functions
(define-private (min (a uint) (b uint))
  (if (<= a b) a b)
)

(define-private (max (a uint) (b uint))
  (if (>= a b) a b)
)

(define-private (is-valid-status (status uint))
  (or (is-eq status ESCROW-STATUS-ACTIVE)
      (or (is-eq status ESCROW-STATUS-RELEASED)
          (or (is-eq status ESCROW-STATUS-REFUNDED)
              (is-eq status ESCROW-STATUS-DISPUTED))))
)

(define-private (calculate-expiry)
  (+ burn-block-height ESCROW-TIMEOUT-BLOCKS)
)

;; Public functions
(define-public (create-escrow (asset-id uint) (amount uint))
  (begin
    (asserts! (> amount u0) ERR-INVALID-AMOUNT)
    (asserts! (is-none (map-get? escrows { asset-id: asset-id })) ERR-ALREADY-EXISTS)
    (asserts! (>= (stx-get-balance tx-sender) amount) ERR-INSUFFICIENT-FUNDS)
    
    ;; Transfer STX to contract
    (try! (stx-transfer? amount tx-sender (as-contract tx-sender)))
    
    (map-set escrows
      { asset-id: asset-id }
      {
        depositor: tx-sender,
        beneficiary: none,
        amount: amount,
        status: ESCROW-STATUS-ACTIVE,
        created-at: burn-block-height,
        expires-at: (calculate-expiry),
        released-at: none,
        dispute-deadline: none
      }
    )
    
    (var-set total-escrowed (+ (var-get total-escrowed) amount))
    (ok true)
  )
)

(define-public (release-escrow (asset-id uint) (beneficiary principal))
  (let ((escrow-data (unwrap! (map-get? escrows { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get depositor escrow-data)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) ESCROW-STATUS-ACTIVE) ERR-ESCROW-LOCKED)
    (asserts! (<= burn-block-height (get expires-at escrow-data)) ERR-ESCROW-EXPIRED)
    
    ;; Transfer STX to beneficiary
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender beneficiary)))
    
    (map-set escrows
      { asset-id: asset-id }
      (merge escrow-data {
        beneficiary: (some beneficiary),
        status: ESCROW-STATUS-RELEASED,
        released-at: (some burn-block-height),
        dispute-deadline: (some (+ burn-block-height DISPUTE-WINDOW-BLOCKS))
      })
    )
    
    (var-set total-escrowed (- (var-get total-escrowed) (get amount escrow-data)))
    (ok true)
  )
)

(define-public (refund-escrow (asset-id uint))
  (let ((escrow-data (unwrap! (map-get? escrows { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (is-eq tx-sender (get depositor escrow-data)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) ESCROW-STATUS-ACTIVE) ERR-ESCROW-LOCKED)
    (asserts! (> burn-block-height (get expires-at escrow-data)) ERR-INVALID-AMOUNT)
    
    ;; Transfer STX back to depositor
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender (get depositor escrow-data))))
    
    (map-set escrows
      { asset-id: asset-id }
      (merge escrow-data {
        status: ESCROW-STATUS-REFUNDED,
        released-at: (some burn-block-height)
      })
    )
    
    (var-set total-escrowed (- (var-get total-escrowed) (get amount escrow-data)))
    (ok true)
  )
)

(define-public (initiate-dispute (asset-id uint) (reason (string-ascii 200)))
  (let ((escrow-data (unwrap! (map-get? escrows { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (or (is-eq tx-sender (get depositor escrow-data))
                  (is-eq (some tx-sender) (get beneficiary escrow-data))) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) ESCROW-STATUS-RELEASED) ERR-ESCROW-LOCKED)
    (asserts! (is-dispute-window-active asset-id) ERR-ESCROW-EXPIRED)
    (asserts! (is-none (map-get? dispute-records { asset-id: asset-id })) ERR-ALREADY-EXISTS)
    (asserts! (> (len reason) u0) ERR-INVALID-AMOUNT)
    
    (map-set escrows
      { asset-id: asset-id }
      (merge escrow-data {
        status: ESCROW-STATUS-DISPUTED
      })
    )
    
    (map-set dispute-records
      { asset-id: asset-id }
      {
        initiator: tx-sender,
        reason: reason,
        created-at: burn-block-height,
        resolved: false
      }
    )
    
    (ok true)
  )
)

(define-public (resolve-dispute (asset-id uint) (award-to-depositor bool))
  (let ((escrow-data (unwrap! (map-get? escrows { asset-id: asset-id }) ERR-NOT-FOUND))
        (dispute-data (unwrap! (map-get? dispute-records { asset-id: asset-id }) ERR-NOT-FOUND)))
    
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (get status escrow-data) ESCROW-STATUS-DISPUTED) ERR-ESCROW-LOCKED)
    (asserts! (not (get resolved dispute-data)) ERR-ALREADY-EXISTS)
    
    (let ((recipient (if award-to-depositor 
                        (get depositor escrow-data)
                        (unwrap! (get beneficiary escrow-data) ERR-NOT-FOUND))))
      
      ;; Transfer STX to determined recipient
      (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender recipient)))
      
      (map-set escrows
        { asset-id: asset-id }
        (merge escrow-data {
          status: (if award-to-depositor ESCROW-STATUS-REFUNDED ESCROW-STATUS-RELEASED)
        })
      )
      
      (map-set dispute-records
        { asset-id: asset-id }
        (merge dispute-data {
          resolved: true
        })
      )
      
      (var-set total-escrowed (- (var-get total-escrowed) (get amount escrow-data)))
      (ok true)
    )
  )
)

(define-public (emergency-refund (asset-id uint))
  (let ((escrow-data (unwrap! (map-get? escrows { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    
    ;; Transfer STX back to depositor
    (try! (as-contract (stx-transfer? (get amount escrow-data) tx-sender (get depositor escrow-data))))
    
    (map-set escrows
      { asset-id: asset-id }
      (merge escrow-data {
        status: ESCROW-STATUS-REFUNDED,
        released-at: (some burn-block-height)
      })
    )
    
    (var-set total-escrowed (- (var-get total-escrowed) (get amount escrow-data)))
    (ok true)
  )
)