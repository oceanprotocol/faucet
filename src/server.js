const express = require("express");
const bodyParser = require("body-parser");
const url = require("url");
const HDWalletProvider = require("truffle-hdwallet-provider");
const Web3 = require("web3");
const path = require("path");
const abi = require("./abi/token");
const { connection, insert, find } = require("./db");
const { isAllowed } = require("./util");
var client = null;
require("dotenv").config();

var tokenInstance = null;
const rpc = process.env.RPC;

const provider = new HDWalletProvider(
  process.env.SEED_PHRASE,
  rpc
);
const web3 = new Web3(provider);
const account = provider.getAddress(0)
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

app.get("/", async (req, res) => {
  let balance = await getBalance();
  res.render("index.ejs", { message: null, status: false, balance });
});

app.get("/send", async (req, res) => {
  try {
    let balance = await getBalance();
    let ipAddress =
      req.headers["x-forwarded-for"] || req.connection.remoteAddress;
    console.log(`ip address - `, ipAddress);
    const url_parts = url.parse(req.url, true);
    const query = url_parts.query;

    const from = account;
    const to = query.address;
    const value = web3.utils.toWei(process.env.TOKEN_AMOUNT, "ether");
    //check if its valid ETH address

    if (web3.utils.isAddress(to)) {
      //check if this user is in cool down period
      await find(
        {
          $or: [{ wallet: query.address }]
        },
        async records => {
          console.log(records[0]);
          if (records[0] && !isAllowed(records[0].lastUpdatedOn)) {
            res.render("index.ejs", {
              message: "You have to wait 24 hours between faucet requests",
              status: false,
              balance
            });
          } else {
            //insert ip address into db
            await insert(
              { ip: ipAddress, wallet: to, lastUpdatedOn: Date.now() },
              result => console.log(result)
            );

            //create token instance from abi and contract address
            const tokenInst = getTokenInstance();

            tokenInst.methods
              .transfer(to, value)
              .send({ from }, async function(error, txHash) {
                if (!error) {
                  console.log("txHash - ", txHash);
                  res.render("index.ejs", {
                    message: `Great!! test OCEANs are on the way !!`,
                    txHash,
                    status: true,
                    balance
                  });
                } else {
                  console.error(error);
                }
              });
          }
        }
      );
    } else {
      //handle incorrect address response
      res.render("index.ejs", {
        message: `Please enter valid Ethereum Wallet Address`,
        status: false,
        balance
      });
    }
  } catch (err) {
    console.error(err);
  }
});

async function getBalance() {
  let tokenInst = getTokenInstance();
  let bal = await tokenInst.methods.balanceOf(account).call();
  let balance = web3.utils.fromWei(bal, "ether");
  return Math.floor(balance);
}

function getTokenInstance() {
  if (!tokenInstance) {
    //create token instance from abi and contract address
    tokenInstance = new web3.eth.Contract(
      abi,
      process.env.TOKEN_CONTRACT_ADDRESS
    );
  }
  return tokenInstance;
}

const port = process.env.PORT || 4000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/public"));
app.use(express.static(__dirname + "/public"));

app.listen(port, async () => {
  client = await connection();
  console.log("Listening on port - ", port);
});
