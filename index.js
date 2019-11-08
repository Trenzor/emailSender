// AWS reqs
const AWS = require('aws-sdk');
const db = new AWS.DynamoDB({
    apiVersion: '2012-10-08'
});

const puppeteer = require('puppeteer-core'); // For browser automation
const chromium = require('chrome-aws-lambda');
const needle = require('needle'); // for easy API calls

const mfgID = process.env.mfg_id; // For accessing mfgID info saved in dynamoDB
let token;
let params = {
    TableName: "tokens",
    Key: {
        mfg_id: {
            "S": mfgID
        }
    }
};

exports.handler = function (event, context, callback) {
    db.getItem(params, function (err, data) {
        if (err) {
            console.log("Token error: " + err);
        } else {
            // Get oauth token from mongoDB
            token = data;
            let apiKey = token['Item']['production']['L'][0]['M']['API-Key']['S'];
            let authKey = token['Item']['production']['L'][0]['M']['Authorization']['S'];

            // Set headers for OMS calls
            let options = {
                headers: {
                    'API-Key': apiKey,
                    'Authorization': authKey,
                    'Content-Type': 'application/json'
                }
            };

            let customerID = event.customerID;
            let currentEvent = event.eventTypeID;
            let orderType = event.orderType;
            let orderID = event.orderID.toString();

            // Check if this notification matters 
            if ((currentEvent !== "create_order") || (orderType !== "IN_STORE_PICKUP")) {
                return console.log(currentEvent + "_" + orderType + " is not the event_orderType you're looking for.");
            }

            // URLs for OMS calls
            let getCustomer_URL = 'https://integration.shopatron.com/api/v2/customer/' + customerID;

            needle('get', getCustomer_URL, options)
                .then(function (resp) {
                    console.log(resp.body);
                    let customerEmail = resp.body.email;

                    (async () => {
                       const browser = await chromium.puppeteer.launch({
                           args: chromium.args,
                           defaultViewport: chromium.defaultViewport,
                           executablePath: await chromium.executablePath,
                           headless: chromium.headless,
                       });

                       let page = await browser.newPage();
                        await page.goto('https://www.shopatron.com/admin/tools/email_tester')
                        await page.type('#username', process.env.KIBO_USER)
                        await page.type('#password', process.env.KIBO_PWD)
                        await page.click('[name="submit"]')
                        await page.waitFor(2000);
                        console.log('In')
                        await page.select('select[name="message"]', 'send_sts_confirmation');
                        await page.type('[name="email"]', customerEmail)
                        await page.type('[name="order_id"][type="input"]', orderID)
                        await page.click('[name=send_now]')
                        await page.click('[name=go]')
                        browser.close()
                        console.log('Sent')
                    })()
                })
                .catch(function (err) {
                    console.error(err)
                });
        }
    })
};