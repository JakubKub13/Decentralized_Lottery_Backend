const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery Unit Tests", function () {
        let lottery, vrfCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
        const chainId = network.config.chainId

        beforeEach(async function () {
            deployer = (await getNamedAccounts()).deployer
            await deployments.fixture(["all"]) // We deploy everything based on tag "all"
            lottery = await ethers.getContract("Lottery", deployer)
            vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
            lotteryEntranceFee = await lottery.getEntranceFee()
            interval = await lottery.getInterval()
        })

        describe("Constructor", function() {
            it("Initializes the Lottery correctly", async function() {
                const lotteryState = await lottery.getLotteryState()
                assert.equal(lotteryState.toString(), "0")
                assert.equal(interval.toString(), networkConfig[chainId]["interval"])
            })
        })

        describe("Enter Lottery", function() {
            it("Reverts when you don't pay enough", async function() {
                await expect(lottery.enterLottery()).to.be.revertedWith("Lottery__NotEnoughETHEntered")
            })
            it("Records players when they enter the lottery", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                const playerFromContract = await lottery.getPlayer(0)
                assert.equal(playerFromContract, deployer)
            })
            it("Emits Event on enter", async function() {
                await expect(lottery.enterLottery({ value: lotteryEntranceFee})).to.emit(lottery, "LotteryEnter")
            })
            it("Does not allow entrance when lottery is in calculating state", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                // We simulate ChainLink keeper action
                await lottery.performUpkeep([])
                await expect(lottery.enterLottery({ value: lotteryEntranceFee })).to.be.revertedWith("Lottery__NotOpen")
            })
        })

        describe("checkUpKeep", function() {
            it("Returns false if people have not sent any ETH", async function() {
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                // callStatic --> simulate calling this transaction and see what it responses
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            it("Returns false if lottery is not open", async function () {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                await lottery.performUpkeep([]) // [] or "0x" -> represents blank bytes object to pass as arg
                const lotteryState = await lottery.getLotteryState()
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert.equal(lotteryState.toString(), "1")
                assert.equal(upkeepNeeded, false)
            })
            it("Returns false if enough time has not passed", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() - 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                assert(!upkeepNeeded)
            })
            it("Returns true if enough time has passed, players are registered, has ETH, is in Open state", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x")
                assert(upkeepNeeded)
            })
        })

        describe("performUpkeep", function() {
            it("Can only run if checkUpKeep is true", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const tx = await lottery.performUpkeep([])
                assert(tx)
            })
            it("Reverts when checkUpKeep is false", async function() {
                await expect(lottery.performUpkeep([])).to.be.revertedWith("Lottery__UpkeepNotNeeded")
            })
            it("Updates the lottery state, emits an event, and calls the vrfCoordinator", async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
                const txResponse = await lottery.performUpkeep([])
                const txReceipt = await txResponse.wait(1)
                const requestId = txReceipt.events[1].args.requestId
                const lotteryState = await lottery.getLotteryState()
                assert(requestId.toNumber() > 0)
                assert(lotteryState.toString() == "1")
            })
        })

        describe("fulFillRandomWords", function() {
            beforeEach(async function() {
                await lottery.enterLottery({ value: lotteryEntranceFee })
                await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                await network.provider.send("evm_mine", [])
            })
            it("Can only be called after performUpkeep", async function() {
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)).to.be.revertedWith("nonexistent request")
                await expect(vrfCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)).to.be.revertedWith("nonexistent request")
            })
            it("Picks a winner, resets the lottery and sends money", async function () {
                const additionalEntrants = 3
                const startingAccountIndex = 1 //deployer = 0 
                const accounts = await ethers.getSigners()
                for(let i = startingAccountIndex; i < startingAccountIndex + additionalEntrants; i++) {
                    const accountConnectedLottery = lottery.connect(accounts[i])
                    await accountConnectedLottery.enterLottery({ value: lotteryEntranceFee })
                }
                const startingTimeStamp = await lottery.getLatestTimeStamp()
                await new Promise(async (resolve, reject) => {
                    lottery.once("WinnerPicked", async () => {
                        console.log("Found the event !")
                        try {
                            const recentWinner = await lottery.getRecentWinner()
                            const lotteryState = await lottery.getLotteryState()
                            const endingTimeStamp = await lottery.getLatestTimeStamp()
                            const numPlayers = await lottery.getNumberOfPlayers()
                            const winnerEndingBalance = await accounts[1].getBalance()
                            assert.equal(numPlayers.toString(), "0")
                            assert.equal(lotteryState.toString(), "0")
                            assert(endingTimeStamp > startingTimeStamp)
                            // This simply means that the winner should end with a balance of all of the money that every other player added to this contract
                            assert.equal(winnerEndingBalance.toString(), winnerStartingBalance.add(lotteryEntranceFee.mul(additionalEntrants).add(lotteryEntranceFee).toString()))

                        } catch(e) {
                            reject(e)
                        }
                        resolve()
                    })
                    // Setting up listener
                    // We fire the event listener will pick it up and resolve  
                    const tx = await lottery.performUpkeep([])
                    const txReceipt = await tx.wait(1)
                    const winnerStartingBalance = await accounts[1].getBalance()
                    await vrfCoordinatorV2Mock.fulfillRandomWords(txReceipt.events[1].args.requestId, lottery.address)
                })
            })
        })
    })