//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

/* 
Player enters the lottery by paying entrance amount
Lottery picks random winner (VRF randomness)
Winner will be selected every X minutes automaticly
// Utilizing Chainlink Oracle for Randomness, Automated Execution
*/

import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";

/* CUSTOM ERRORS */
error Lottery__NotEnoughETHEntered();

contract Lottery is VRFConsumerBaseV2 {

/* STATE VARIABLES */
    uint256 private immutable i_entranceFee;
    address payable[] private s_players;

/* EVENTS */
event LotteryEnter(address indexed player);


    constructor(address vrfCoordinatorV2, uint256 entranceFee) VRFConsumerBaseV2(vrfCoordinatorV2) {
        i_entranceFee = entranceFee;
    }

    function enterLottery() public payable {
        if(msg.value < i_entranceFee) {
            revert Lottery__NotEnoughETHEntered();
        }
        s_players.push(payable(msg.sender));
        emit LotteryEnter(msg.sender);
    }

    function requestRandomWinner() external {

    }

    function fulfillRandomWords(uint256 requestId, uint256[] memory rondomWords) internal override {}

/* VIEW PURE FUNCTIONS*/
    function getEntranceFee() public view returns (uint256) {
        return i_entranceFee;
    }

    function getPlayer(uint256 index) public view returns (address) {
        return s_players[index];
    }
}

