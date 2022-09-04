//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

/* 
Player enters the lottery by paying entrance amount
Lottery picks random winner (VRF randomness)
Winner will be selected every X minutes automaticly
// Utilizing Chainlink Oracle for Randomness, Automated Execution
*/

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";

/* CUSTOM ERRORS */
error Lottery__NotEnoughETHEntered();
error Lottery__TransferFailedError();

contract Lottery is VRFConsumerBaseV2 {

/* STATE VARIABLES */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;
    VRFCoordinatorV2Interface private immutable i_vrfCoordinator;
    bytes32 private immutable i_keyHash;
    uint64 private immutable i_subscriptionId;
    uint32 private immutable i_callbackGasLimit;
    uint16 private constant REQUEST_CONFIRMATIONS = 3;
    uint32 private constant NUM_WORDS = 1;
    
/* LOTTERY VARIABLES */// @title A title that should describe the contract/interface
    address private s_recentWinner;

/* EVENTS */
event LotteryEnter(address indexed player);
event RequestedLotteryWinner(uint256 indexed requestId);
event WinnerPicked(address indexed winner);


    constructor(address vrfCoordinatorV2, uint256 entranceFee, bytes32 keyHash, uint64 subscriptionId, uint32 callbackGasLimit) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
        i_vrfCoordinator = VRFCoordinatorV2Interface(vrfCoordinatorV2);
        i_keyHash = keyHash;
        i_subscriptionId = subscriptionId;
        i_callbackGasLimit = callbackGasLimit;
    }

    function enterLottery() public payable {
        if(msg.value < i_entranceFee) {
            revert Lottery__NotEnoughETHEntered();
        }
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

/* This function requests random number using vrfCoordinator / 2 transactions process */
    function requestRandomWinner() external {
        uint256 requestId = i_vrfCoordinator.requestRandomWords(
            i_keyHash,  
            i_subscriptionId,
            REQUEST_CONFIRMATIONS,
            i_callbackGasLimit,
            NUM_WORDS
        );
        emit RequestedLotteryWinner(requestId);

    }

    function fulfillRandomWords(uint256 /*requestId*/, uint256[] memory randomWords) internal override {
        uint256 indexOfWinner = randomWords[0] % s_players.length;
        address payable recentWinner = s_players[indexOfWinner];
        s_recentWinner = recentWinner;
        (bool success, ) = recentWinner.call{value: address(this).balance}("");
        if(!success) {
            revert Lottery__TransferFailedError();
        }
        emit WinnerPicked(recentWinner);
    }

/* VIEW PURE FUNCTIONS*/
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }

    function getRecentWinner() public view returns (address) {
        return s_recentWinner;
    }
}

