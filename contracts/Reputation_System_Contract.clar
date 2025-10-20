;; Reputation System Contract
;; Manages user reputation scores and trust metrics for the platform

;; Error codes
(define-constant ERR-UNAUTHORIZED (err u300))
(define-constant ERR-NOT-FOUND (err u301))
(define-constant ERR-INVALID-RATING (err u302))
(define-constant ERR-ALREADY-RATED (err u303))
(define-constant ERR-SELF-RATING (err u304))
(define-constant ERR-INSUFFICIENT-REPUTATION (err u305))

;; Rating constants
(define-constant MIN-RATING u1)
(define-constant MAX-RATING u5)
(define-constant INITIAL-REPUTATION u100)
(define-constant MIN-REPUTATION u0)
(define-constant MAX-REPUTATION u1000)

;; Reputation action weights
(define-constant SUCCESSFUL-RETURN-BONUS u20)
(define-constant SUCCESSFUL-FIND-BONUS u15)
(define-constant FALSE-REPORT-PENALTY u10)
(define-constant DISPUTE-PENALTY u5)
(define-constant RATING-WEIGHT u2)

;; Data structures
(define-map user-reputation
  { user: principal }
  {
    score: uint,
    total-interactions: uint,
    successful-returns: uint,
    successful-finds: uint,
    disputes-against: uint,
    false-reports: uint,
    average-rating: uint,
    total-ratings: uint,
    last-updated: uint
  }
)

(define-map user-ratings
  { rater: principal, ratee: principal, asset-id: uint }
  {
    rating: uint,
    comment: (string-ascii 200),
    timestamp: uint
  }
)

(define-map reputation-history
  { user: principal, entry-id: uint }
  {
    action: (string-ascii 50),
    score-change: int,
    asset-id: uint,
    timestamp: uint
  }
)

(define-map user-badges
  { user: principal, badge-type: (string-ascii 20) }
  {
    earned-at: uint,
    level: uint
  }
)

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var next-entry-id uint u1)

;; Read-only functions
(define-read-only (get-user-reputation (user principal))
  (default-to {
    score: INITIAL-REPUTATION,
    total-interactions: u0,
    successful-returns: u0,
    successful-finds: u0,
    disputes-against: u0,
    false-reports: u0,
    average-rating: u0,
    total-ratings: u0,
    last-updated: u0
  } (map-get? user-reputation { user: user }))
)

(define-read-only (get-user-rating (rater principal) (ratee principal) (asset-id uint))
  (map-get? user-ratings { rater: rater, ratee: ratee, asset-id: asset-id })
)

(define-read-only (get-reputation-entry (user principal) (entry-id uint))
  (map-get? reputation-history { user: user, entry-id: entry-id })
)

(define-read-only (get-user-badge (user principal) (badge-type (string-ascii 20)))
  (map-get? user-badges { user: user, badge-type: badge-type })
)

(define-read-only (calculate-trust-score (user principal))
  (let ((rep-data (get-user-reputation user)))
    (if (is-eq (get total-interactions rep-data) u0)
      u50 ;; Default trust score for new users
      (let ((base-score (get score rep-data))
            (success-rate (if (> (get total-interactions rep-data) u0)
                            (/ (* (+ (get successful-returns rep-data) (get successful-finds rep-data)) u100)
                               (get total-interactions rep-data))
                            u0))
            (rating-bonus (if (> (get total-ratings rep-data) u0)
                            (* (get average-rating rep-data) u5)
                            u0)))
        (min u100 (+ (/ base-score u10) (/ success-rate u2) (/ rating-bonus u5)))
      )
    )
  )
)

(define-read-only (get-user-rank (user principal))
  (let ((rep-data (get-user-reputation user))
        (score (get score rep-data)))
    (if (>= score u800)
      "legendary"
      (if (>= score u600)
        "expert"
        (if (>= score u400)
          "trusted"
          (if (>= score u200)
            "reliable"
            "newcomer"
          )
        )
      )
    )
  )
)

;; Private functions
(define-private (min (a uint) (b uint))
  (if (<= a b) a b)
)

(define-private (max (a uint) (b uint))
  (if (>= a b) a b)
)

(define-private (is-valid-rating (rating uint))
  (and (>= rating MIN-RATING) (<= rating MAX-RATING))
)

(define-private (update-average-rating (user principal) (new-rating uint))
  (let ((rep-data (get-user-reputation user))
        (current-total (* (get average-rating rep-data) (get total-ratings rep-data)))
        (new-total-ratings (+ (get total-ratings rep-data) u1)))
    (/ (+ current-total new-rating) new-total-ratings)
  )
)

(define-private (add-reputation-entry (user principal) (action (string-ascii 50)) (score-change int) (asset-id uint))
  (let ((entry-id (var-get next-entry-id)))
    (map-set reputation-history
      { user: user, entry-id: entry-id }
      {
        action: action,
        score-change: score-change,
        asset-id: asset-id,
        timestamp: burn-block-height
      }
    )
    (var-set next-entry-id (+ entry-id u1))
    true
  )
)

(define-private (award-badge (user principal) (badge-type (string-ascii 20)) (level uint))
  (map-set user-badges
    { user: user, badge-type: badge-type }
    {
      earned-at: burn-block-height,
      level: level
    }
  )
)

(define-private (check-and-award-badges (user principal))
  (let ((rep-data (get-user-reputation user)))
    ;; Helper badge for successful finds
    (if (>= (get successful-finds rep-data) u5)
      (award-badge user "finder" (/ (get successful-finds rep-data) u5)) false)
    
    ;; Returner badge for successful returns
    (if (>= (get successful-returns rep-data) u3)
      (award-badge user "returner" (/ (get successful-returns rep-data) u3)) false)
    
    ;; Trusted badge for high reputation
    (if (>= (get score rep-data) u500)
      (award-badge user "trusted" u1) false)
    
    ;; Veteran badge for many interactions
    (if (>= (get total-interactions rep-data) u20)
      (award-badge user "veteran" u1) false)
    
    ;; Perfect badge for flawless record
    (if (and (>= (get total-interactions rep-data) u10)
             (is-eq (get disputes-against rep-data) u0)
             (is-eq (get false-reports rep-data) u0))
      (award-badge user "perfect" u1) false)
  )
)

;; Public functions
(define-public (initialize-user-reputation)
  (let ((existing-rep (map-get? user-reputation { user: tx-sender })))
    (if (is-none existing-rep)
      (begin
        (map-set user-reputation
          { user: tx-sender }
          {
            score: INITIAL-REPUTATION,
            total-interactions: u0,
            successful-returns: u0,
            successful-finds: u0,
            disputes-against: u0,
            false-reports: u0,
            average-rating: u0,
            total-ratings: u0,
            last-updated: burn-block-height
          }
        )
        (ok true)
      )
      (ok false) ;; Already initialized
    )
  )
)

(define-public (record-successful-return (user principal) (asset-id uint))
  (let ((rep-data (get-user-reputation user)))
    (asserts! (or (is-eq tx-sender (var-get contract-owner))
                  (is-eq tx-sender user)) ERR-UNAUTHORIZED)
    
    (map-set user-reputation
      { user: user }
      (merge rep-data {
        score: (min MAX-REPUTATION (+ (get score rep-data) SUCCESSFUL-RETURN-BONUS)),
        total-interactions: (+ (get total-interactions rep-data) u1),
        successful-returns: (+ (get successful-returns rep-data) u1),
        last-updated: burn-block-height
      })
    )
    
    (add-reputation-entry user "successful-return" (to-int SUCCESSFUL-RETURN-BONUS) asset-id)
    (check-and-award-badges user)
    (ok true)
  )
)

(define-public (record-successful-find (user principal) (asset-id uint))
  (let ((rep-data (get-user-reputation user)))
    (asserts! (or (is-eq tx-sender (var-get contract-owner))
                  (is-eq tx-sender user)) ERR-UNAUTHORIZED)
    
    (map-set user-reputation
      { user: user }
      (merge rep-data {
        score: (min MAX-REPUTATION (+ (get score rep-data) SUCCESSFUL-FIND-BONUS)),
        total-interactions: (+ (get total-interactions rep-data) u1),
        successful-finds: (+ (get successful-finds rep-data) u1),
        last-updated: burn-block-height
      })
    )
    
    (add-reputation-entry user "successful-find" (to-int SUCCESSFUL-FIND-BONUS) asset-id)
    (check-and-award-badges user)
    (ok true)
  )
)

(define-public (record-dispute (user principal) (asset-id uint))
  (let ((rep-data (get-user-reputation user)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    
    (map-set user-reputation
      { user: user }
      (merge rep-data {
        score: (max MIN-REPUTATION (- (get score rep-data) DISPUTE-PENALTY)),
        disputes-against: (+ (get disputes-against rep-data) u1),
        last-updated: burn-block-height
      })
    )
    
    (add-reputation-entry user "dispute" (to-int (- DISPUTE-PENALTY)) asset-id)
    (ok true)
  )
)

(define-public (record-false-report (user principal) (asset-id uint))
  (let ((rep-data (get-user-reputation user)))
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    
    (map-set user-reputation
      { user: user }
      (merge rep-data {
        score: (max MIN-REPUTATION (- (get score rep-data) FALSE-REPORT-PENALTY)),
        false-reports: (+ (get false-reports rep-data) u1),
        last-updated: burn-block-height
      })
    )
    
    (add-reputation-entry user "false-report" (to-int (- FALSE-REPORT-PENALTY)) asset-id)
    (ok true)
  )
)

(define-public (rate-user (ratee principal) (asset-id uint) (rating uint) (comment (string-ascii 200)))
  (begin
    (asserts! (not (is-eq tx-sender ratee)) ERR-SELF-RATING)
    (asserts! (is-valid-rating rating) ERR-INVALID-RATING)
    (asserts! (is-none (map-get? user-ratings { rater: tx-sender, ratee: ratee, asset-id: asset-id })) ERR-ALREADY-RATED)
    
    ;; Record the rating
    (map-set user-ratings
      { rater: tx-sender, ratee: ratee, asset-id: asset-id }
      {
        rating: rating,
        comment: comment,
        timestamp: burn-block-height
      }
    )
    
    ;; Update ratee's reputation
    (let ((rep-data (get-user-reputation ratee))
          (new-average (update-average-rating ratee rating)))
      
      (map-set user-reputation
        { user: ratee }
        (merge rep-data {
          average-rating: new-average,
          total-ratings: (+ (get total-ratings rep-data) u1),
          score: (if (> rating u3) 
                   (min MAX-REPUTATION (+ (get score rep-data) RATING-WEIGHT))
                   (max MIN-REPUTATION (- (get score rep-data) RATING-WEIGHT))),
          last-updated: burn-block-height
        })
      )
      
      (add-reputation-entry ratee "rating-received" 
        (if (> rating u3) (to-int RATING-WEIGHT) (to-int (- RATING-WEIGHT))) asset-id)
      (check-and-award-badges ratee)
      (ok true)
    )
  )
)

(define-public (bulk-update-reputation (users (list 20 principal)) (actions (list 20 (string-ascii 50))) (asset-ids (list 20 uint)))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (asserts! (is-eq (len users) (len actions)) ERR-INVALID-RATING)
    (asserts! (is-eq (len users) (len asset-ids)) ERR-INVALID-RATING)
    
    (ok (map bulk-process-reputation-update users actions asset-ids))
  )
)

(define-private (bulk-process-reputation-update (user principal) (action (string-ascii 50)) (asset-id uint))
  (let ((rep-data (get-user-reputation user)))
    (if (is-eq action "successful-return")
      (begin
        (map-set user-reputation { user: user }
          (merge rep-data {
            score: (min MAX-REPUTATION (+ (get score rep-data) SUCCESSFUL-RETURN-BONUS)),
            successful-returns: (+ (get successful-returns rep-data) u1),
            total-interactions: (+ (get total-interactions rep-data) u1),
            last-updated: burn-block-height
          })
        )
        (add-reputation-entry user action (to-int SUCCESSFUL-RETURN-BONUS) asset-id)
        true
      )
      (if (is-eq action "successful-find")
        (begin
          (map-set user-reputation { user: user }
            (merge rep-data {
              score: (min MAX-REPUTATION (+ (get score rep-data) SUCCESSFUL-FIND-BONUS)),
              successful-finds: (+ (get successful-finds rep-data) u1),
              total-interactions: (+ (get total-interactions rep-data) u1),
              last-updated: burn-block-height
            })
          )
          (add-reputation-entry user action (to-int SUCCESSFUL-FIND-BONUS) asset-id)
          true
        )
        false
      )
    )
  )
)

(define-public (reset-user-reputation (user principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    
    (map-set user-reputation
      { user: user }
      {
        score: INITIAL-REPUTATION,
        total-interactions: u0,
        successful-returns: u0,
        successful-finds: u0,
        disputes-against: u0,
        false-reports: u0,
        average-rating: u0,
        total-ratings: u0,
        last-updated: burn-block-height
      }
    )
    
    (add-reputation-entry user "reputation-reset" 0 u0)
    (ok true)
  )
)

(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)