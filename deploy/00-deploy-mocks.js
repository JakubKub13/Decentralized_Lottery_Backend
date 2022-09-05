const { network } = require("hardhat")
const { developmentChains } = require("../helper-hardhat-config.js")

const BASE_FEE = ethers.utils.parseEther("0.25") // 0.25 Link per request is the premium fee 
const GAS_PRICE_LINK = 1e9 //calculated value based on the gas price of the chain /1e9 = 1 000 000 000

module.exports = async function ({ getNamedAccounts, deployments }) {
    const {deploy, log} = deployments
    const { deployer } = await getNamedAccounts()
    const args = [BASE_FEE, GAS_PRICE_LINK]

    if(developmentChains.includes(network.name)) {
        log("Local network detected! Deploying Mocks.......")
        // deploy a mock version of vrfCoordinator....
        await deploy("VRFCoordinatorV2Mock", {
            from: deployer,
            log: true,
            args: args,
        })
        log("Mocks Deployed !")
        log("--------------------------------------------------------------------")
    }
}
module.exports.tags = ["all", "mocks"]