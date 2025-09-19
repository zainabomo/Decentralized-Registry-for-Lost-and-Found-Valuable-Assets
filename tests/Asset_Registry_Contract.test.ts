
import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const contractName = "Asset_Registry_Contract";

describe("Asset Registry Contract Tests", () => {
  beforeEach(() => {
    simnet.mineEmptyBlocks(1);
  });

  it("should have correct initial state", () => {
    const { result } = simnet.callReadOnlyFn(
      contractName,
      "get-next-asset-id",
      [],
      deployer
    );
    expect(result).toBeUint(1);
  });

  it("should register lost asset successfully", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "register-lost-asset",
      [
        Cl.stringAscii("phone"),
        Cl.stringAscii("iPhone 12 Pro"),
        Cl.stringAscii("Central Park"),
        Cl.uint(1000),
        Cl.buffer(new Uint8Array(32).fill(1)),
        Cl.buffer(new Uint8Array(32).fill(2))
      ],
      wallet1
    );
    
    expect(result).toBeOk(Cl.uint(1));
  });

  it("should fail with invalid input", () => {
    const { result } = simnet.callPublicFn(
      contractName,
      "register-lost-asset",
      [
        Cl.stringAscii(""), // Empty asset type
        Cl.stringAscii("iPhone 12 Pro"),
        Cl.stringAscii("Central Park"),
        Cl.uint(1000),
        Cl.buffer(new Uint8Array(32).fill(1)),
        Cl.buffer(new Uint8Array(32).fill(2))
      ],
      wallet1
    );
    
    expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-INPUT
  });

  it("should allow owner to update status", () => {
    simnet.callPublicFn(
      contractName,
      "register-lost-asset",
      [
        Cl.stringAscii("phone"),
        Cl.stringAscii("iPhone 12 Pro"),
        Cl.stringAscii("Central Park"),
        Cl.uint(1000),
        Cl.buffer(new Uint8Array(32).fill(1)),
        Cl.buffer(new Uint8Array(32).fill(2))
      ],
      wallet1
    );
    
    const { result } = simnet.callPublicFn(
      contractName,
      "update-asset-status",
      [
        Cl.uint(1),
        Cl.uint(2), // STATUS-FOUND
        Cl.some(Cl.standardPrincipal(wallet2))
      ],
      wallet1
    );
    
    expect(result).toBeOk(Cl.bool(true));
  });

  it("should validate status values", () => {
    const validStatuses = [1, 2, 3, 4];
    
    validStatuses.forEach(status => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "is-valid-status",
        [Cl.uint(status)],
        deployer
      );
      expect(result).toBeBool(true);
    });
  });
});
  contactInfoHash: new Uint8Array(32).fill(3)
};

describe("Asset Registry Contract Tests", () => {
  beforeEach(() => {
    // Reset simnet state between tests
    simnet.mineEmptyBlocks(1);
  });

  describe("Initial Contract State", () => {
    it("should have correct initial next asset ID", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-next-asset-id",
        [],
        deployer
      );
      expect(result).toBeUint(1);
    });

    it("should return none for non-existent asset", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-asset",
        [Cl.uint(999)],
        deployer
      );
      expect(result).toBeNone();
    });

    it("should return 0 for category count of non-existent category", () => {
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-asset-count-by-category",
        [Cl.stringAscii("nonexistent")],
        deployer
      );
      expect(result).toBeUint(0);
    });
  });

  describe("Asset Registration - Lost Assets", () => {
    it("should successfully register a lost asset", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should increment next asset ID after registration", () => {
      simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-next-asset-id",
        [],
        deployer
      );
      expect(result).toBeUint(2);
    });

    it("should store asset data correctly", () => {
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      const { result: assetData } = simnet.callReadOnlyFn(
        contractName,
        "get-asset",
        [Cl.uint(assetId)],
        deployer
      );
      
      const asset = assetData.expectSome().expectTuple();
      expect(asset.owner).toBeStandardPrincipal(wallet1);
      expect(asset["asset-type"]).toBeStringAscii(validAssetData.assetType);
      expect(asset.description).toBeStringAscii(validAssetData.description);
      expect(asset["location-last-seen"]).toBeStringAscii(validAssetData.locationLastSeen);
      expect(asset["reward-amount"]).toBeUint(validAssetData.rewardAmount);
      expect(asset.status).toBeUint(1); // STATUS-LOST
      expect(asset.finder).toBeNone();
      expect(asset["location-found"]).toBeNone();
      expect(asset["date-found"]).toBeNone();
    });

    it("should increment category count", () => {
      simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );

      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-asset-count-by-category",
        [Cl.stringAscii(validAssetData.assetType)],
        deployer
      );
      expect(result).toBeUint(1);
    });

    it("should fail with invalid input - empty asset type", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(""),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-INPUT
    });

    it("should fail with invalid input - empty description", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(""),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-INPUT
    });

    it("should fail with invalid input - empty location", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(""),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-INPUT
    });
  });

  describe("Asset Registration - Found Assets", () => {
    it("should successfully register a found asset", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "register-found-asset",
        [
          Cl.stringAscii(validFoundAssetData.assetType),
          Cl.stringAscii(validFoundAssetData.description),
          Cl.stringAscii(validFoundAssetData.locationFound),
          Cl.buffer(validFoundAssetData.contactInfoHash)
        ],
        wallet2
      );
      
      expect(result).toBeOk(Cl.uint(1));
    });

    it("should store found asset data correctly", () => {
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-found-asset",
        [
          Cl.stringAscii(validFoundAssetData.assetType),
          Cl.stringAscii(validFoundAssetData.description),
          Cl.stringAscii(validFoundAssetData.locationFound),
          Cl.buffer(validFoundAssetData.contactInfoHash)
        ],
        wallet2
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      const { result: assetData } = simnet.callReadOnlyFn(
        contractName,
        "get-asset",
        [Cl.uint(assetId)],
        deployer
      );
      
      const asset = assetData.expectSome().expectTuple();
      expect(asset.owner).toBeStandardPrincipal(wallet2);
      expect(asset["asset-type"]).toBeStringAscii(validFoundAssetData.assetType);
      expect(asset.description).toBeStringAscii(validFoundAssetData.description);
      expect(asset["location-last-seen"]).toBeStringAscii(validFoundAssetData.locationFound);
      expect(asset["reward-amount"]).toBeUint(0);
      expect(asset.status).toBeUint(2); // STATUS-FOUND
      expect(asset.finder).toBeSome(Cl.standardPrincipal(wallet2));
      expect(asset["location-found"]).toBeSome(Cl.stringAscii(validFoundAssetData.locationFound));
      expect(asset["date-found"]).toBeSome();
    });
  });

  describe("Asset Status Updates", () => {
    it("should allow owner to update asset status", () => {
      // First register a lost asset
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      // Update status to found
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-status",
        [
          Cl.uint(assetId),
          Cl.uint(2), // STATUS-FOUND
          Cl.some(Cl.standardPrincipal(wallet2))
        ],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify status was updated
      const { result: assetData } = simnet.callReadOnlyFn(
        contractName,
        "get-asset",
        [Cl.uint(assetId)],
        deployer
      );
      
      const asset = assetData.expectSome().expectTuple();
      expect(asset.status).toBeUint(2); // STATUS-FOUND
      expect(asset.finder).toBeSome(Cl.standardPrincipal(wallet2));
    });

    it("should fail when non-owner tries to update status", () => {
      // First register a lost asset
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      // Try to update status as non-owner
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-status",
        [
          Cl.uint(assetId),
          Cl.uint(2), // STATUS-FOUND
          Cl.none()
        ],
        wallet3
      );
      
      expect(result).toBeErr(Cl.uint(100)); // ERR-UNAUTHORIZED
    });

    it("should fail with invalid status", () => {
      // First register a lost asset
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      // Try to update with invalid status
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-status",
        [
          Cl.uint(assetId),
          Cl.uint(99), // Invalid status
          Cl.none()
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(103)); // ERR-INVALID-STATUS
    });

    it("should fail when asset doesn't exist", () => {
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-status",
        [
          Cl.uint(999), // Non-existent asset
          Cl.uint(2),
          Cl.none()
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(101)); // ERR-NOT-FOUND
    });
  });

  describe("Location Updates", () => {
    it("should allow owner to update location found", () => {
      // First register a lost asset
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      const newLocation = "Brooklyn Bridge NYC";
      
      // Update location found
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-location-found",
        [
          Cl.uint(assetId),
          Cl.stringAscii(newLocation)
        ],
        wallet1
      );
      
      expect(result).toBeOk(Cl.bool(true));
      
      // Verify location was updated 
      const { result: assetData } = simnet.callReadOnlyFn(
        contractName,
        "get-asset",
        [Cl.uint(assetId)],
        deployer
      );
      
      const asset = assetData.expectSome().expectTuple();
      expect(asset["location-found"]).toBeSome(Cl.stringAscii(newLocation));
    });

    it("should fail with empty location", () => {
      // First register a lost asset
      const { result: registerResult } = simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii(validAssetData.assetType),
          Cl.stringAscii(validAssetData.description),
          Cl.stringAscii(validAssetData.locationLastSeen),
          Cl.uint(validAssetData.rewardAmount),
          Cl.buffer(validAssetData.contactInfoHash),
          Cl.buffer(validAssetData.verificationCode)
        ],
        wallet1
      );
      
      const assetId = registerResult.expectOk().expectUint();
      
      // Try to update with empty location
      const { result } = simnet.callPublicFn(
        contractName,
        "update-asset-location-found",
        [
          Cl.uint(assetId),
          Cl.stringAscii("")
        ],
        wallet1
      );
      
      expect(result).toBeErr(Cl.uint(104)); // ERR-INVALID-INPUT
    });
  });

  describe("Status Validation", () => {
    it("should validate correct status values", () => {
      const validStatuses = [1, 2, 3, 4]; // LOST, FOUND, CLAIMED, RETURNED
      
      validStatuses.forEach(status => {
        const { result } = simnet.callReadOnlyFn(
          contractName,
          "is-valid-status",
          [Cl.uint(status)],
          deployer
        );
        expect(result).toBeBool(true);
      });
    });

    it("should reject invalid status values", () => {
      const invalidStatuses = [0, 5, 99, 1000];
      
      invalidStatuses.forEach(status => {
        const { result } = simnet.callReadOnlyFn(
          contractName,
          "is-valid-status",
          [Cl.uint(status)],
          deployer
        );
        expect(result).toBeBool(false);
      });
    });
  });

  describe("Multiple Assets and Categories", () => {
    it("should handle multiple assets in same category", () => {
      // Register multiple assets of same type
      simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii("phone"),
          Cl.stringAscii("First phone"),
          Cl.stringAscii("Location 1"),
          Cl.uint(100),
          Cl.buffer(new Uint8Array(32).fill(1)),
          Cl.buffer(new Uint8Array(32).fill(1))
        ],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii("phone"),
          Cl.stringAscii("Second phone"),
          Cl.stringAscii("Location 2"),
          Cl.uint(200),
          Cl.buffer(new Uint8Array(32).fill(2)),
          Cl.buffer(new Uint8Array(32).fill(2))
        ],
        wallet2
      );
      
      const { result } = simnet.callReadOnlyFn(
        contractName,
        "get-asset-count-by-category",
        [Cl.stringAscii("phone")],
        deployer
      );
      expect(result).toBeUint(2);
    });

    it("should handle assets in different categories", () => {
      // Register assets of different types
      simnet.callPublicFn(
        contractName,
        "register-lost-asset",
        [
          Cl.stringAscii("laptop"),
          Cl.stringAscii("MacBook Pro 2021"),
          Cl.stringAscii("Coffee shop"),
          Cl.uint(1500),
          Cl.buffer(new Uint8Array(32).fill(1)),
          Cl.buffer(new Uint8Array(32).fill(1))
        ],
        wallet1
      );
      
      simnet.callPublicFn(
        contractName,
        "register-found-asset",
        [
          Cl.stringAscii("keys"),
          Cl.stringAscii("Car keys with blue keychain"),
          Cl.stringAscii("Parking lot"),
          Cl.buffer(new Uint8Array(32).fill(2))
        ],
        wallet2
      );
      
      // Check individual category counts
      const { result: laptopCount } = simnet.callReadOnlyFn(
        contractName,
        "get-asset-count-by-category",
        [Cl.stringAscii("laptop")],
        deployer
      );
      expect(laptopCount).toBeUint(1);
      
      const { result: keysCount } = simnet.callReadOnlyFn(
        contractName,
        "get-asset-count-by-category",
        [Cl.stringAscii("keys")],
        deployer
      );
      expect(keysCount).toBeUint(1);
    });
  });
});
