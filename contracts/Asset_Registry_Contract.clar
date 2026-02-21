;; Asset Registry Contract
;; Manages the registration and tracking of lost/found valuable assets

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-EXISTS (err u102))
(define-constant ERR-INVALID-STATUS (err u103))
(define-constant ERR-INVALID-INPUT (err u104))
(define-constant ERR-INVALID-MATCH (err u105))
(define-constant ERR-MATCH-NOT-FOUND (err u106))
(define-constant ERR-MATCH-ALREADY-EXISTS (err u107))
(define-constant ERR-VERIFICATION-FAILED (err u108))
(define-constant ERR-INVALID-VERIFICATION-CODE (err u109))

;; Asset status constants
(define-constant STATUS-LOST u1)
(define-constant STATUS-FOUND u2)
(define-constant STATUS-CLAIMED u3)
(define-constant STATUS-RETURNED u4)

;; Data structures
(define-map assets
  { asset-id: uint }
  {
    owner: principal,
    finder: (optional principal),
    asset-type: (string-ascii 50),
    description: (string-ascii 500),
    location-last-seen: (string-ascii 200),
    location-found: (optional (string-ascii 200)),
    status: uint,
    reward-amount: uint,
    date-reported: uint,
    date-found: (optional uint),
    contact-info-hash: (buff 32),
    verification-code: (buff 32)
  }
)

(define-map asset-categories
  { category: (string-ascii 50) }
  { count: uint }
)

;; Match request tracking
(define-map match-requests
  { lost-asset-id: uint, found-asset-id: uint }
  {
    proposer: principal,
    status: uint,
    match-score: uint,
    proposed-at: uint,
    verified-at: (optional uint),
    verification-attempts: uint
  }
)

;; Match status constants
(define-constant MATCH-STATUS-PENDING u1)
(define-constant MATCH-STATUS-VERIFIED u2)
(define-constant MATCH-STATUS-REJECTED u3)
(define-constant MATCH-STATUS-COMPLETED u4)

;; Match verification constants
(define-constant MAX-VERIFICATION-ATTEMPTS u5)
(define-constant MIN-MATCH-SCORE u60)

;; Data variables
(define-data-var next-asset-id uint u1)
(define-data-var contract-owner principal tx-sender)

;; Read-only functions
(define-read-only (get-asset (asset-id uint))
  (map-get? assets { asset-id: asset-id })
)

(define-read-only (get-asset-count-by-category (category (string-ascii 50)))
  (default-to u0 (get count (map-get? asset-categories { category: category })))
)

(define-read-only (get-next-asset-id)
  (var-get next-asset-id)
)

(define-read-only (is-valid-status (status uint))
  (or (is-eq status STATUS-LOST)
      (or (is-eq status STATUS-FOUND)
          (or (is-eq status STATUS-CLAIMED)
              (is-eq status STATUS-RETURNED))))
)

(define-read-only (get-match-request (lost-asset-id uint) (found-asset-id uint))
  (map-get? match-requests { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id })
)

(define-read-only (is-valid-match-status (status uint))
  (or (is-eq status MATCH-STATUS-PENDING)
      (or (is-eq status MATCH-STATUS-VERIFIED)
          (or (is-eq status MATCH-STATUS-REJECTED)
              (is-eq status MATCH-STATUS-COMPLETED))))
)

;; Private functions
(define-private (min (a uint) (b uint))
  (if (<= a b) a b)
)

(define-private (max (a uint) (b uint))
  (if (>= a b) a b)
)

(define-private (increment-category-count (category (string-ascii 50)))
  (let ((current-count (get-asset-count-by-category category)))
    (map-set asset-categories
      { category: category }
      { count: (+ current-count u1) }
    )
  )
)

(define-private (validate-asset-input (asset-type (string-ascii 50)) (description (string-ascii 500)) (location (string-ascii 200)))
  (and (> (len asset-type) u0)
       (> (len description) u0)
       (> (len location) u0))
)

(define-private (calculate-string-similarity (str1 (string-ascii 500)) (str2 (string-ascii 500)))
  ;; Simple similarity check: if strings are equal, return 100, otherwise return 50
  ;; In production, this could use more sophisticated algorithms
  (if (is-eq str1 str2)
    u100
    u50
  )
)

(define-private (calculate-match-score-internal (lost-asset-id uint) (found-asset-id uint))
  ;; Calculate match score based on asset type and description similarity
  ;; Returns a score from 0-100
  (let ((lost-asset (unwrap! (map-get? assets { asset-id: lost-asset-id }) u0))
        (found-asset (unwrap! (map-get? assets { asset-id: found-asset-id }) u0)))

    (if (and (is-some (map-get? assets { asset-id: lost-asset-id }))
             (is-some (map-get? assets { asset-id: found-asset-id })))
      (let ((type-match (if (is-eq (get asset-type lost-asset) (get asset-type found-asset)) u50 u0))
            (desc-similarity (/ (calculate-string-similarity (get description lost-asset) (get description found-asset)) u2)))
        (+ type-match desc-similarity)
      )
      u0
    )
  )
)

;; Public functions
(define-public (register-lost-asset 
  (asset-type (string-ascii 50))
  (description (string-ascii 500))
  (location-last-seen (string-ascii 200))
  (reward-amount uint)
  (contact-info-hash (buff 32))
  (verification-code (buff 32)))
  (let ((asset-id (var-get next-asset-id)))
    (asserts! (validate-asset-input asset-type description location-last-seen) ERR-INVALID-INPUT)
    (asserts! (is-none (map-get? assets { asset-id: asset-id })) ERR-ALREADY-EXISTS)
    
    (map-set assets
      { asset-id: asset-id }
      {
        owner: tx-sender,
        finder: none,
        asset-type: asset-type,
        description: description,
        location-last-seen: location-last-seen,
        location-found: none,
        status: STATUS-LOST,
        reward-amount: reward-amount,
        date-reported: burn-block-height,
        date-found: none,
        contact-info-hash: contact-info-hash,
        verification-code: verification-code
      }
    )
    
    (increment-category-count asset-type)
    (var-set next-asset-id (+ asset-id u1))
    (ok asset-id)
  )
)

(define-public (register-found-asset
  (asset-type (string-ascii 50))
  (description (string-ascii 500))
  (location-found (string-ascii 200))
  (contact-info-hash (buff 32)))
  (let ((asset-id (var-get next-asset-id)))
    (asserts! (validate-asset-input asset-type description location-found) ERR-INVALID-INPUT)
    
    (map-set assets
      { asset-id: asset-id }
      {
        owner: tx-sender,
        finder: (some tx-sender),
        asset-type: asset-type,
        description: description,
        location-last-seen: location-found,
        location-found: (some location-found),
        status: STATUS-FOUND,
        reward-amount: u0,
        date-reported: burn-block-height,
        date-found: (some burn-block-height),
        contact-info-hash: contact-info-hash,
        verification-code: 0x00000000000000000000000000000000000000000000000000000000000000
      }
    )
    
    (increment-category-count asset-type)
    (var-set next-asset-id (+ asset-id u1))
    (ok asset-id)
  )
)

(define-public (update-asset-status (asset-id uint) (new-status uint) (finder-principal (optional principal)))
  (let ((asset-data (unwrap! (map-get? assets { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (or (is-eq tx-sender (get owner asset-data))
                  (is-eq (some tx-sender) (get finder asset-data))) ERR-UNAUTHORIZED)
    (asserts! (is-valid-status new-status) ERR-INVALID-STATUS)
    
    (map-set assets
      { asset-id: asset-id }
      (merge asset-data {
        status: new-status,
        finder: (if (is-some finder-principal) finder-principal (get finder asset-data)),
        date-found: (if (and (is-eq new-status STATUS-FOUND) (is-none (get date-found asset-data)))
                       (some burn-block-height)
                       (get date-found asset-data))
      })
    )
    (ok true)
  )
)

(define-public (update-asset-location-found (asset-id uint) (location-found (string-ascii 200)))
  (let ((asset-data (unwrap! (map-get? assets { asset-id: asset-id }) ERR-NOT-FOUND)))
    (asserts! (or (is-eq tx-sender (get owner asset-data))
                  (is-eq (some tx-sender) (get finder asset-data))) ERR-UNAUTHORIZED)
    (asserts! (> (len location-found) u0) ERR-INVALID-INPUT)

    (map-set assets
      { asset-id: asset-id }
      (merge asset-data {
        location-found: (some location-found)
      })
    )
    (ok true)
  )
)

;; Asset Matching and Verification Functions

(define-public (propose-match (lost-asset-id uint) (found-asset-id uint))
  ;; Propose a match between a lost and found asset
  ;; Can be called by either the owner of the lost asset or the finder of the found asset
  (let ((lost-asset (unwrap! (map-get? assets { asset-id: lost-asset-id }) ERR-NOT-FOUND))
        (found-asset (unwrap! (map-get? assets { asset-id: found-asset-id }) ERR-NOT-FOUND)))

    ;; Validate that one is lost and one is found
    (asserts! (is-eq (get status lost-asset) STATUS-LOST) ERR-INVALID-MATCH)
    (asserts! (is-eq (get status found-asset) STATUS-FOUND) ERR-INVALID-MATCH)

    ;; Validate that proposer is either owner of lost asset or finder of found asset
    (asserts! (or (is-eq tx-sender (get owner lost-asset))
                  (is-eq tx-sender (unwrap! (get finder found-asset) ERR-UNAUTHORIZED))) ERR-UNAUTHORIZED)

    ;; Check if match already exists
    (asserts! (is-none (map-get? match-requests { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id })) ERR-MATCH-ALREADY-EXISTS)

    ;; Calculate match score
    (let ((match-score (calculate-match-score-internal lost-asset-id found-asset-id)))
      (map-set match-requests
        { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }
        {
          proposer: tx-sender,
          status: MATCH-STATUS-PENDING,
          match-score: match-score,
          proposed-at: burn-block-height,
          verified-at: none,
          verification-attempts: u0
        }
      )
      (ok match-score)
    )
  )
)

(define-public (verify-match (lost-asset-id uint) (found-asset-id uint) (verification-code (buff 32)))
  ;; Verify a match by providing the correct verification code
  ;; Only the owner of the lost asset can verify
  (let ((lost-asset (unwrap! (map-get? assets { asset-id: lost-asset-id }) ERR-NOT-FOUND))
        (match-request (unwrap! (map-get? match-requests { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }) ERR-MATCH-NOT-FOUND)))

    ;; Only owner of lost asset can verify
    (asserts! (is-eq tx-sender (get owner lost-asset)) ERR-UNAUTHORIZED)

    ;; Match must be in pending status
    (asserts! (is-eq (get status match-request) MATCH-STATUS-PENDING) ERR-INVALID-MATCH)

    ;; Check verification attempts
    (asserts! (< (get verification-attempts match-request) MAX-VERIFICATION-ATTEMPTS) ERR-VERIFICATION-FAILED)

    ;; Verify the code
    (if (is-eq verification-code (get verification-code lost-asset))
      (begin
        ;; Update match status to verified
        (map-set match-requests
          { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }
          (merge match-request {
            status: MATCH-STATUS-VERIFIED,
            verified-at: (some burn-block-height)
          })
        )
        (ok true)
      )
      (begin
        ;; Increment verification attempts
        (map-set match-requests
          { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }
          (merge match-request {
            verification-attempts: (+ (get verification-attempts match-request) u1)
          })
        )
        (ok false)
      )
    )
  )
)

(define-public (reject-match (lost-asset-id uint) (found-asset-id uint))
  ;; Reject a match proposal
  ;; Can be called by the owner of the lost asset
  (let ((lost-asset (unwrap! (map-get? assets { asset-id: lost-asset-id }) ERR-NOT-FOUND))
        (match-request (unwrap! (map-get? match-requests { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }) ERR-MATCH-NOT-FOUND)))

    ;; Only owner of lost asset can reject
    (asserts! (is-eq tx-sender (get owner lost-asset)) ERR-UNAUTHORIZED)

    ;; Match must be in pending status
    (asserts! (is-eq (get status match-request) MATCH-STATUS-PENDING) ERR-INVALID-MATCH)

    ;; Update match status to rejected
    (map-set match-requests
      { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id }
      (merge match-request {
        status: MATCH-STATUS-REJECTED
      })
    )
    (ok true)
  )
)

(define-read-only (get-match-score (lost-asset-id uint) (found-asset-id uint))
  ;; Get the calculated match score for two assets
  (match (map-get? match-requests { lost-asset-id: lost-asset-id, found-asset-id: found-asset-id })
    match-data (get match-score match-data)
    (calculate-match-score-internal lost-asset-id found-asset-id)
  )
)