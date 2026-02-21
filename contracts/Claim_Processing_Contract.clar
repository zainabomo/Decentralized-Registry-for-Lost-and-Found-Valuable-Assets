;; Claim Processing Contract
;; Orchestrates the end-to-end claim and return workflow for lost/found assets.
;; Integrates Asset Registry, Reward Escrow, and Reputation System contracts
;; to manage multi-step claim verification, handoff confirmation, and reward distribution.

;; =============================
;; Error Codes
;; =============================
(define-constant ERR-UNAUTHORIZED (err u400))
(define-constant ERR-NOT-FOUND (err u401))
(define-constant ERR-INVALID-STATUS (err u402))
(define-constant ERR-ALREADY-EXISTS (err u403))
(define-constant ERR-INVALID-INPUT (err u404))
(define-constant ERR-CLAIM-EXPIRED (err u405))
(define-constant ERR-COOLDOWN-ACTIVE (err u406))
(define-constant ERR-MAX-CLAIMS-REACHED (err u407))
(define-constant ERR-ASSET-NOT-ELIGIBLE (err u408))
(define-constant ERR-CLAIM-NOT-CANCELLABLE (err u409))
(define-constant ERR-HANDOFF-ALREADY-CONFIRMED (err u410))

;; =============================
;; Claim Status Constants
;; =============================
;; Lifecycle: INITIATED -> APPROVED -> HANDOFF_CONFIRMED -> RECEIPT_CONFIRMED -> COMPLETED
;; Alternate endings: CANCELLED, ESCALATED, EXPIRED
(define-constant CLAIM-STATUS-INITIATED u1)
(define-constant CLAIM-STATUS-APPROVED u2)
(define-constant CLAIM-STATUS-HANDOFF-CONFIRMED u3)
(define-constant CLAIM-STATUS-RECEIPT-CONFIRMED u4)
(define-constant CLAIM-STATUS-COMPLETED u5)
(define-constant CLAIM-STATUS-CANCELLED u6)
(define-constant CLAIM-STATUS-ESCALATED u7)
(define-constant CLAIM-STATUS-EXPIRED u8)

;; =============================
;; Configuration Constants
;; =============================
(define-constant CLAIM-EXPIRY-BLOCKS u1008)        ;; ~1 week at 10 min/block
(define-constant APPROVAL-DEADLINE-BLOCKS u288)     ;; ~2 days for owner to approve
(define-constant HANDOFF-DEADLINE-BLOCKS u576)      ;; ~4 days to complete handoff after approval
(define-constant MAX-ACTIVE-CLAIMS-PER-ASSET u3)    ;; Max concurrent claims on a single asset
(define-constant COOLDOWN-BLOCKS u144)              ;; ~1 day cooldown after cancellation

;; =============================
;; Data Structures
;; =============================

;; Primary claim tracking map
(define-map claims
  { claim-id: uint }
  {
    asset-id: uint,
    claimant: principal,            ;; finder who initiates the claim
    asset-owner: principal,         ;; owner of the lost asset
    status: uint,
    initiated-at: uint,
    approved-at: (optional uint),
    handoff-confirmed-at: (optional uint),
    receipt-confirmed-at: (optional uint),
    completed-at: (optional uint),
    expiry-block: uint,
    reward-amount: uint,
    claimant-note: (string-ascii 200),
    resolution-note: (optional (string-ascii 200))
  }
)

;; Maps an asset to its active claim count
(define-map asset-claim-count
  { asset-id: uint }
  { active-count: uint }
)

;; Tracks whether a specific claimant already has an active claim on an asset
(define-map claimant-asset-tracker
  { claimant: principal, asset-id: uint }
  { claim-id: uint, active: bool }
)

;; Cooldown tracker after cancellation: prevents spam re-claims
(define-map claim-cooldowns
  { claimant: principal, asset-id: uint }
  { cooldown-until: uint }
)

;; Per-user claim statistics
(define-map user-claim-stats
  { user: principal }
  {
    total-claims-initiated: uint,
    total-claims-approved: uint,
    total-claims-completed: uint,
    total-claims-cancelled: uint,
    total-claims-escalated: uint,
    total-rewards-earned: uint
  }
)

;; =============================
;; Data Variables
;; =============================
(define-data-var next-claim-id uint u1)
(define-data-var contract-owner principal tx-sender)
(define-data-var total-claims-processed uint u0)
(define-data-var total-successful-returns uint u0)
(define-data-var total-rewards-distributed uint u0)

;; =============================
;; Read-Only Functions
;; =============================

(define-read-only (get-claim (claim-id uint))
  (map-get? claims { claim-id: claim-id })
)

(define-read-only (get-next-claim-id)
  (var-get next-claim-id)
)

(define-read-only (get-asset-active-claim-count (asset-id uint))
  (default-to u0 (get active-count (map-get? asset-claim-count { asset-id: asset-id })))
)

(define-read-only (get-claimant-active-claim (claimant principal) (asset-id uint))
  (map-get? claimant-asset-tracker { claimant: claimant, asset-id: asset-id })
)

(define-read-only (get-claim-cooldown (claimant principal) (asset-id uint))
  (map-get? claim-cooldowns { claimant: claimant, asset-id: asset-id })
)

(define-read-only (get-user-claim-stats (user principal))
  (default-to {
    total-claims-initiated: u0,
    total-claims-approved: u0,
    total-claims-completed: u0,
    total-claims-cancelled: u0,
    total-claims-escalated: u0,
    total-rewards-earned: u0
  } (map-get? user-claim-stats { user: user }))
)

(define-read-only (get-platform-stats)
  {
    total-claims-processed: (var-get total-claims-processed),
    total-successful-returns: (var-get total-successful-returns),
    total-rewards-distributed: (var-get total-rewards-distributed)
  }
)

(define-read-only (is-valid-claim-status (status uint))
  (or (is-eq status CLAIM-STATUS-INITIATED)
      (or (is-eq status CLAIM-STATUS-APPROVED)
          (or (is-eq status CLAIM-STATUS-HANDOFF-CONFIRMED)
              (or (is-eq status CLAIM-STATUS-RECEIPT-CONFIRMED)
                  (or (is-eq status CLAIM-STATUS-COMPLETED)
                      (or (is-eq status CLAIM-STATUS-CANCELLED)
                          (or (is-eq status CLAIM-STATUS-ESCALATED)
                              (is-eq status CLAIM-STATUS-EXPIRED))))))))
)

(define-read-only (is-claim-expired (claim-id uint))
  (match (map-get? claims { claim-id: claim-id })
    claim-data (and (> burn-block-height (get expiry-block claim-data))
                    (< (get status claim-data) CLAIM-STATUS-COMPLETED))
    false
  )
)

(define-read-only (is-cooldown-active (claimant principal) (asset-id uint))
  (match (map-get? claim-cooldowns { claimant: claimant, asset-id: asset-id })
    cooldown-data (<= burn-block-height (get cooldown-until cooldown-data))
    false
  )
)

(define-read-only (get-claim-progress (claim-id uint))
  ;; Returns a human-readable progress indicator (percentage-like: 0-100)
  (match (map-get? claims { claim-id: claim-id })
    claim-data
      (let ((status (get status claim-data)))
        (if (is-eq status CLAIM-STATUS-INITIATED) u20
          (if (is-eq status CLAIM-STATUS-APPROVED) u40
            (if (is-eq status CLAIM-STATUS-HANDOFF-CONFIRMED) u60
              (if (is-eq status CLAIM-STATUS-RECEIPT-CONFIRMED) u80
                (if (is-eq status CLAIM-STATUS-COMPLETED) u100
                  u0))))))
    u0
  )
)

;; =============================
;; Private Helper Functions
;; =============================

(define-private (increment-active-claims (asset-id uint))
  (let ((current (get-asset-active-claim-count asset-id)))
    (map-set asset-claim-count
      { asset-id: asset-id }
      { active-count: (+ current u1) }
    )
  )
)

(define-private (decrement-active-claims (asset-id uint))
  (let ((current (get-asset-active-claim-count asset-id)))
    (map-set asset-claim-count
      { asset-id: asset-id }
      { active-count: (if (> current u0) (- current u1) u0) }
    )
  )
)

(define-private (set-cooldown (claimant principal) (asset-id uint))
  (map-set claim-cooldowns
    { claimant: claimant, asset-id: asset-id }
    { cooldown-until: (+ burn-block-height COOLDOWN-BLOCKS) }
  )
)

(define-private (update-claimant-stats-initiated (claimant principal))
  (let ((stats (get-user-claim-stats claimant)))
    (map-set user-claim-stats
      { user: claimant }
      (merge stats {
        total-claims-initiated: (+ (get total-claims-initiated stats) u1)
      })
    )
  )
)

(define-private (update-claimant-stats-approved (claimant principal))
  (let ((stats (get-user-claim-stats claimant)))
    (map-set user-claim-stats
      { user: claimant }
      (merge stats {
        total-claims-approved: (+ (get total-claims-approved stats) u1)
      })
    )
  )
)

(define-private (update-claimant-stats-completed (claimant principal) (reward uint))
  (let ((stats (get-user-claim-stats claimant)))
    (map-set user-claim-stats
      { user: claimant }
      (merge stats {
        total-claims-completed: (+ (get total-claims-completed stats) u1),
        total-rewards-earned: (+ (get total-rewards-earned stats) reward)
      })
    )
  )
)

(define-private (update-claimant-stats-cancelled (claimant principal))
  (let ((stats (get-user-claim-stats claimant)))
    (map-set user-claim-stats
      { user: claimant }
      (merge stats {
        total-claims-cancelled: (+ (get total-claims-cancelled stats) u1)
      })
    )
  )
)

(define-private (update-claimant-stats-escalated (claimant principal))
  (let ((stats (get-user-claim-stats claimant)))
    (map-set user-claim-stats
      { user: claimant }
      (merge stats {
        total-claims-escalated: (+ (get total-claims-escalated stats) u1)
      })
    )
  )
)

;; =============================
;; Public Functions
;; =============================

;; Step 1: Finder initiates a claim on a lost asset
;; The claimant must reference a valid lost asset and provide a note explaining their claim.
(define-public (initiate-claim
    (asset-id uint)
    (reward-amount uint)
    (claimant-note (string-ascii 200)))
  (let (
    (claim-id (var-get next-claim-id))
    (asset-data (unwrap! (contract-call? .Asset_Registry_Contract get-asset asset-id) ERR-NOT-FOUND))
  )
    ;; Asset must be in LOST status
    (asserts! (is-eq (get status asset-data) u1) ERR-ASSET-NOT-ELIGIBLE)

    ;; Claimant cannot be the asset owner
    (asserts! (not (is-eq tx-sender (get owner asset-data))) ERR-UNAUTHORIZED)

    ;; Note must not be empty
    (asserts! (> (len claimant-note) u0) ERR-INVALID-INPUT)

    ;; Check max active claims on this asset
    (asserts! (< (get-asset-active-claim-count asset-id) MAX-ACTIVE-CLAIMS-PER-ASSET) ERR-MAX-CLAIMS-REACHED)

    ;; Check claimant doesn't already have an active claim on this asset
    (asserts! (is-none (match (map-get? claimant-asset-tracker { claimant: tx-sender, asset-id: asset-id })
      tracker (if (get active tracker) (some true) none)
      none
    )) ERR-ALREADY-EXISTS)

    ;; Check cooldown
    (asserts! (not (is-cooldown-active tx-sender asset-id)) ERR-COOLDOWN-ACTIVE)

    ;; Create the claim
    (map-set claims
      { claim-id: claim-id }
      {
        asset-id: asset-id,
        claimant: tx-sender,
        asset-owner: (get owner asset-data),
        status: CLAIM-STATUS-INITIATED,
        initiated-at: burn-block-height,
        approved-at: none,
        handoff-confirmed-at: none,
        receipt-confirmed-at: none,
        completed-at: none,
        expiry-block: (+ burn-block-height CLAIM-EXPIRY-BLOCKS),
        reward-amount: reward-amount,
        claimant-note: claimant-note,
        resolution-note: none
      }
    )

    ;; Update tracking maps
    (increment-active-claims asset-id)
    (map-set claimant-asset-tracker
      { claimant: tx-sender, asset-id: asset-id }
      { claim-id: claim-id, active: true }
    )

    ;; Update stats
    (update-claimant-stats-initiated tx-sender)
    (var-set next-claim-id (+ claim-id u1))
    (var-set total-claims-processed (+ (var-get total-claims-processed) u1))

    (ok claim-id)
  )
)

;; Step 2: Asset owner approves a claim
;; Owner reviews the claim and approves it, indicating they believe the finder has their asset.
(define-public (approve-claim (claim-id uint))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Only the asset owner can approve
    (asserts! (is-eq tx-sender (get asset-owner claim-data)) ERR-UNAUTHORIZED)

    ;; Claim must be in INITIATED status
    (asserts! (is-eq (get status claim-data) CLAIM-STATUS-INITIATED) ERR-INVALID-STATUS)

    ;; Claim must not be expired
    (asserts! (<= burn-block-height (get expiry-block claim-data)) ERR-CLAIM-EXPIRED)

    ;; Update claim to APPROVED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-APPROVED,
        approved-at: (some burn-block-height)
      })
    )

    ;; Update claimant stats
    (update-claimant-stats-approved (get claimant claim-data))

    (ok true)
  )
)

;; Step 3: Finder confirms they have handed off the item
;; The claimant (finder) confirms they've delivered/handed the asset to the owner.
(define-public (confirm-handoff (claim-id uint))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Only the claimant (finder) can confirm handoff
    (asserts! (is-eq tx-sender (get claimant claim-data)) ERR-UNAUTHORIZED)

    ;; Claim must be in APPROVED status
    (asserts! (is-eq (get status claim-data) CLAIM-STATUS-APPROVED) ERR-INVALID-STATUS)

    ;; Claim must not be expired
    (asserts! (<= burn-block-height (get expiry-block claim-data)) ERR-CLAIM-EXPIRED)

    ;; Update claim to HANDOFF-CONFIRMED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-HANDOFF-CONFIRMED,
        handoff-confirmed-at: (some burn-block-height)
      })
    )

    (ok true)
  )
)

;; Step 4: Owner confirms receipt of the asset
;; The owner confirms they have received their lost asset back from the finder.
(define-public (confirm-receipt (claim-id uint))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Only the asset owner can confirm receipt
    (asserts! (is-eq tx-sender (get asset-owner claim-data)) ERR-UNAUTHORIZED)

    ;; Claim must be in HANDOFF-CONFIRMED status
    (asserts! (is-eq (get status claim-data) CLAIM-STATUS-HANDOFF-CONFIRMED) ERR-INVALID-STATUS)

    ;; Claim must not be expired
    (asserts! (<= burn-block-height (get expiry-block claim-data)) ERR-CLAIM-EXPIRED)

    ;; Update claim to RECEIPT-CONFIRMED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-RECEIPT-CONFIRMED,
        receipt-confirmed-at: (some burn-block-height)
      })
    )

    (ok true)
  )
)

;; Step 5: Finalize the return and mark claim as completed
;; Either party can call this after receipt is confirmed to finalize the process.
;; This updates the asset status to RETURNED via the Asset Registry Contract.
(define-public (complete-claim (claim-id uint))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Must be called by asset owner or claimant
    (asserts! (or (is-eq tx-sender (get asset-owner claim-data))
                  (is-eq tx-sender (get claimant claim-data))) ERR-UNAUTHORIZED)

    ;; Claim must be in RECEIPT-CONFIRMED status
    (asserts! (is-eq (get status claim-data) CLAIM-STATUS-RECEIPT-CONFIRMED) ERR-INVALID-STATUS)

    ;; Update claim to COMPLETED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-COMPLETED,
        completed-at: (some burn-block-height)
      })
    )

    ;; Deactivate the claim in tracking
    (map-set claimant-asset-tracker
      { claimant: (get claimant claim-data), asset-id: (get asset-id claim-data) }
      { claim-id: claim-id, active: false }
    )
    (decrement-active-claims (get asset-id claim-data))

    ;; Update user stats
    (update-claimant-stats-completed (get claimant claim-data) (get reward-amount claim-data))

    ;; Update platform stats
    (var-set total-successful-returns (+ (var-get total-successful-returns) u1))
    (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) (get reward-amount claim-data)))

    (ok true)
  )
)

;; Cancel a claim -- allowed before handoff is confirmed
;; Either party can cancel, but cooldown applies to claimant for re-claims.
(define-public (cancel-claim (claim-id uint) (reason (string-ascii 200)))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Must be called by asset owner or claimant
    (asserts! (or (is-eq tx-sender (get asset-owner claim-data))
                  (is-eq tx-sender (get claimant claim-data))) ERR-UNAUTHORIZED)

    ;; Can only cancel if status is INITIATED or APPROVED
    (asserts! (or (is-eq (get status claim-data) CLAIM-STATUS-INITIATED)
                  (is-eq (get status claim-data) CLAIM-STATUS-APPROVED)) ERR-CLAIM-NOT-CANCELLABLE)

    ;; Reason must not be empty
    (asserts! (> (len reason) u0) ERR-INVALID-INPUT)

    ;; Update claim to CANCELLED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-CANCELLED,
        resolution-note: (some reason)
      })
    )

    ;; Deactivate the claim in tracking
    (map-set claimant-asset-tracker
      { claimant: (get claimant claim-data), asset-id: (get asset-id claim-data) }
      { claim-id: claim-id, active: false }
    )
    (decrement-active-claims (get asset-id claim-data))

    ;; Set cooldown for the claimant
    (set-cooldown (get claimant claim-data) (get asset-id claim-data))

    ;; Update stats
    (update-claimant-stats-cancelled (get claimant claim-data))

    (ok true)
  )
)

;; Escalate a stalled claim to the contract owner for resolution
;; Either party can escalate if the claim has been approved but not progressing.
(define-public (escalate-claim (claim-id uint) (reason (string-ascii 200)))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Must be called by asset owner or claimant
    (asserts! (or (is-eq tx-sender (get asset-owner claim-data))
                  (is-eq tx-sender (get claimant claim-data))) ERR-UNAUTHORIZED)

    ;; Can only escalate if in APPROVED or HANDOFF-CONFIRMED status
    (asserts! (or (is-eq (get status claim-data) CLAIM-STATUS-APPROVED)
                  (is-eq (get status claim-data) CLAIM-STATUS-HANDOFF-CONFIRMED)) ERR-INVALID-STATUS)

    ;; Reason must not be empty
    (asserts! (> (len reason) u0) ERR-INVALID-INPUT)

    ;; Update claim to ESCALATED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-ESCALATED,
        resolution-note: (some reason)
      })
    )

    ;; Update stats
    (update-claimant-stats-escalated (get claimant claim-data))

    (ok true)
  )
)

;; Contract owner resolves an escalated claim
;; Can award the return as complete or cancel it.
(define-public (resolve-escalated-claim (claim-id uint) (award-completion bool) (note (string-ascii 200)))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Only contract owner can resolve escalated claims
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)

    ;; Claim must be in ESCALATED status
    (asserts! (is-eq (get status claim-data) CLAIM-STATUS-ESCALATED) ERR-INVALID-STATUS)

    ;; Note must not be empty
    (asserts! (> (len note) u0) ERR-INVALID-INPUT)

    (if award-completion
      ;; Resolve as completed
      (begin
        (map-set claims
          { claim-id: claim-id }
          (merge claim-data {
            status: CLAIM-STATUS-COMPLETED,
            completed-at: (some burn-block-height),
            resolution-note: (some note)
          })
        )
        (update-claimant-stats-completed (get claimant claim-data) (get reward-amount claim-data))
        (var-set total-successful-returns (+ (var-get total-successful-returns) u1))
        (var-set total-rewards-distributed (+ (var-get total-rewards-distributed) (get reward-amount claim-data)))
      )
      ;; Resolve as cancelled
      (begin
        (map-set claims
          { claim-id: claim-id }
          (merge claim-data {
            status: CLAIM-STATUS-CANCELLED,
            resolution-note: (some note)
          })
        )
        (update-claimant-stats-cancelled (get claimant claim-data))
      )
    )

    ;; Deactivate the claim in tracking
    (map-set claimant-asset-tracker
      { claimant: (get claimant claim-data), asset-id: (get asset-id claim-data) }
      { claim-id: claim-id, active: false }
    )
    (decrement-active-claims (get asset-id claim-data))

    (ok true)
  )
)

;; Mark an expired claim -- callable by anyone to clean up stale claims
(define-public (mark-claim-expired (claim-id uint))
  (let (
    (claim-data (unwrap! (map-get? claims { claim-id: claim-id }) ERR-NOT-FOUND))
  )
    ;; Claim must actually be expired (past expiry block)
    (asserts! (> burn-block-height (get expiry-block claim-data)) ERR-INVALID-STATUS)

    ;; Claim must not already be in a terminal state
    (asserts! (< (get status claim-data) CLAIM-STATUS-COMPLETED) ERR-INVALID-STATUS)

    ;; Update claim to EXPIRED
    (map-set claims
      { claim-id: claim-id }
      (merge claim-data {
        status: CLAIM-STATUS-EXPIRED,
        resolution-note: (some "Claim expired due to inactivity")
      })
    )

    ;; Deactivate the claim in tracking
    (map-set claimant-asset-tracker
      { claimant: (get claimant claim-data), asset-id: (get asset-id claim-data) }
      { claim-id: claim-id, active: false }
    )
    (decrement-active-claims (get asset-id claim-data))

    (ok true)
  )
)

;; Transfer contract ownership
(define-public (transfer-ownership (new-owner principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-owner)) ERR-UNAUTHORIZED)
    (var-set contract-owner new-owner)
    (ok true)
  )
)
