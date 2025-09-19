;; Asset Registry Contract
;; Manages the registration and tracking of lost/found valuable assets

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u100))
(define-constant ERR-NOT-FOUND (err u101))
(define-constant ERR-ALREADY-EXISTS (err u102))
(define-constant ERR-INVALID-STATUS (err u103))
(define-constant ERR-INVALID-INPUT (err u104))

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