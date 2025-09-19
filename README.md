# Decentralized Registry for Lost and Found Valuable Assets

A decentralized registry system built on the Stacks blockchain for tracking and managing lost and found valuable assets. This project enables secure, transparent, and immutable record-keeping for lost item registrations and claims through smart contracts.

## 🎯 Project Overview

This decentralized application (dApp) aims to solve the trust and transparency issues in traditional lost-and-found systems by leveraging blockchain technology. Users can register lost assets, claim found items, and build reputation through a tamper-proof, auditable system.

### Key Features

- **Asset Registration**: Secure on-chain registration of lost assets with detailed metadata
- **Claim Management**: Transparent claiming process for found items with ownership verification
- **Reputation System**: Trust-building mechanism for users based on successful transactions
- **Reward Escrow**: Secure escrow system for reward distribution upon successful asset recovery
- **Immutable Records**: Permanent, auditable trail of all asset-related transactions

## 🏗️ Architecture

The system consists of three main smart contracts:

1. **Asset Registry Contract** (`Asset_Registry_Contract.clar`)
   - Manages lost asset registrations
   - Stores asset metadata and ownership information
   - Handles asset status updates

2. **Reputation System Contract** (`Reputation_System_Contract.clar`)
   - Tracks user reputation scores
   - Manages reputation-based incentives
   - Implements trust mechanisms

3. **Reward Escrow Contract** (`Reward_Escrow_Contract.clar`)
   - Handles reward escrow for asset recovery
   - Manages fund distribution
   - Ensures secure reward mechanisms

## 🛠️ Technology Stack

- **Blockchain**: Stacks (Bitcoin Layer 2)
- **Smart Contract Language**: Clarity
- **Development Framework**: Clarinet
- **Testing Framework**: Vitest with Clarinet SDK
- **Package Manager**: npm
- **TypeScript**: For test development

### Dependencies

```json
{
  "@hirosystems/clarinet-sdk": "^3.0.2",
  "@stacks/transactions": "^7.0.6",
  "chokidar-cli": "^3.0.0",
  "vitest": "^3.1.3",
  "vitest-environment-clarinet": "^2.3.0"
}
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- Clarinet CLI

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Decentralized-Registry-for-Lost-and-Found-Valuable-Assets
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Install Clarinet CLI**
   ```bash
   # Using cargo (Rust package manager)
   cargo install clarinet

   # Or download pre-built binaries from:
   # https://github.com/hirosystems/clarinet/releases
   ```

### Development Setup

1. **Verify Clarinet installation**
   ```bash
   clarinet --version
   ```

2. **Check project configuration**
   ```bash
   clarinet check
   ```

3. **Start the local development environment**
   ```bash
   clarinet integrate
   ```

## 🧪 Testing

The project uses Vitest with the Clarinet environment for comprehensive smart contract testing.

### Available Test Commands

```bash
# Run all tests
npm run test

# Run tests with coverage and cost reports
npm run test:report

# Watch mode - automatically re-run tests on file changes
npm run test:watch
```

### Test Structure

- `tests/Asset_Registry_Contract.test.ts` - Tests for asset registration functionality
- `tests/Reputation_System_Contract.test.ts` - Tests for reputation management
- `tests/Reward_Escrow_Contract.test.ts` - Tests for escrow and reward systems

## 📁 Project Structure

```
├── contracts/                     # Smart contracts directory
│   ├── Asset_Registry_Contract.clar
│   ├── Reputation_System_Contract.clar
│   └── Reward_Escrow_Contract.clar
├── tests/                         # Test files
│   ├── Asset_Registry_Contract.test.ts
│   ├── Reputation_System_Contract.test.ts
│   └── Reward_Escrow_Contract.test.ts
├── settings/                      # Network configurations
│   └── Devnet.toml               # Development network settings
├── Clarinet.toml                 # Main project configuration
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
└── vitest.config.js             # Test configuration
```

## ⚙️ Configuration

### Clarinet Configuration

The project is configured with:
- Clarity version 3
- Epoch 3.2 for most contracts
- Development network settings in `settings/Devnet.toml`

### Test Configuration

- Environment: `vitest-environment-clarinet`
- Pool: Single-threaded for deterministic blockchain simulation
- Coverage and cost reporting enabled

## 🔧 Development Workflow

1. **Contract Development**
   - Implement smart contract logic in `.clar` files
   - Use Clarity language features for security and predictability

2. **Testing**
   - Write comprehensive tests in TypeScript
   - Use `simnet` for blockchain simulation
   - Verify contract functionality and edge cases

3. **Deployment**
   ```bash
   # Deploy to devnet
   clarinet deploy --devnet

   # Deploy to testnet (when configured)
   clarinet deploy --testnet
   ```

## 📈 Current Development Status

🚧 **Project Status**: Early Development Phase

The project is currently scaffolded with:
- ✅ Project structure and configuration
- ✅ Testing framework setup
- ✅ Development environment configuration
- 🔄 Smart contract implementation (in progress)
- 🔄 Test implementation (in progress)

### Next Steps

1. Implement core smart contract functionality
2. Develop comprehensive test suites
3. Add frontend interface
4. Deploy to testnet for testing
5. Security audit and optimization

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add/update tests
5. Ensure all tests pass
6. Submit a pull request

### Code Standards

- Follow Clarity best practices for smart contracts
- Maintain comprehensive test coverage
- Use TypeScript for test development
- Follow existing code formatting conventions

## 📄 License

This project is licensed under the ISC License.

## 🔗 Resources

- [Stacks Documentation](https://docs.stacks.co/)
- [Clarity Language Reference](https://book.clarity-lang.org/)
- [Clarinet Documentation](https://docs.hiro.so/stacks/clarinet-js-sdk)
- [Vitest Testing Framework](https://vitest.dev/)

## 🆘 Support

For questions, issues, or contributions:
- Create an issue in the repository
- Check existing documentation and resources
- Review test examples for usage patterns

---

**Note**: This project is in active development. Smart contract functionality is being implemented and tested. Please use with caution in production environments.