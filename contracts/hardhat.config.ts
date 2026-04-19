import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";
const BSC_TESTNET_RPC = process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {},
    ...(DEPLOYER_PRIVATE_KEY
      ? {
          bscTestnet: {
            url: BSC_TESTNET_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            chainId: 97,
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: { bscTestnet: BSCSCAN_API_KEY },
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api-testnet.bscscan.com/api",
          browserURL: "https://testnet.bscscan.com",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
