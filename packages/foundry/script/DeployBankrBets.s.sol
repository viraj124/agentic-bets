// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./DeployHelpers.s.sol";
import "../contracts/BankrBetsOracle.sol";
import "../contracts/BankrBetsPrediction.sol";

/**
 * @notice Deploy script for BankrBets contracts
 * @dev Usage:
 *      yarn deploy --file DeployBankrBets.s.sol              # local anvil
 *      yarn deploy --file DeployBankrBets.s.sol --network base # Base mainnet
 *
 *      On Base mainnet/sepolia, the Oracle is configured with the real V4 PoolManager.
 *      On local anvil, a mock PoolManager is deployed for testing.
 */
contract DeployBankrBets is ScaffoldETHDeploy {
    // Base mainnet USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
    // Base mainnet V4 PoolManager: 0x498581fF718922c3f8e6A244956aF099B2652b2b

    function run() external ScaffoldEthDeployerRunner {
        address poolManagerAddress;
        address usdcAddress;

        if (block.chainid == 31_337) {
            // Local: deploy mock PoolManager + mock USDC
            MockPoolManagerDeploy mockPM = new MockPoolManagerDeploy();
            poolManagerAddress = address(mockPM);
            deployments.push(Deployment({ name: "MockPoolManager", addr: poolManagerAddress }));

            MockUSDCDeploy mockUsdc = new MockUSDCDeploy();
            usdcAddress = address(mockUsdc);
            mockUsdc.mint(deployer, 1_000_000 * 1e6); // 1M USDC
            deployments.push(Deployment({ name: "MockUSDC", addr: usdcAddress }));
        } else if (block.chainid == 8453) {
            // Base mainnet
            poolManagerAddress = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
            usdcAddress = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
        } else if (block.chainid == 84_532) {
            // Base Sepolia — PoolManager address may differ, update as needed
            poolManagerAddress = 0x498581fF718922c3f8e6A244956aF099B2652b2b;
            usdcAddress = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
        } else {
            revert("Unsupported chain");
        }

        // Deploy Oracle (permissionless registry + V4 price oracle)
        BankrBetsOracle oracle = new BankrBetsOracle(poolManagerAddress);
        deployments.push(Deployment({ name: "BankrBetsOracle", addr: address(oracle) }));

        // Deploy Prediction contract
        BankrBetsPrediction prediction = new BankrBetsPrediction(usdcAddress, address(oracle));
        deployments.push(Deployment({ name: "BankrBetsPrediction", addr: address(prediction) }));

        // Link oracle → prediction (required for addTokenFor + active round checks)
        oracle.setPredictionContract(address(prediction));
    }
}

/// @dev Mock PoolManager for local anvil testing — implements extsload
contract MockPoolManagerDeploy {
    mapping(bytes32 => bytes32) public slots;

    function extsload(bytes32 slot) external view returns (bytes32) {
        return slots[slot];
    }

    function setSlot(bytes32 slot, bytes32 value) external {
        slots[slot] = value;
    }
}

/// @dev Simple mock USDC for local testing (6 decimals)
contract MockUSDCDeploy {
    string public name = "USD Coin";
    string public symbol = "USDC";
    uint8 public decimals = 6;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
