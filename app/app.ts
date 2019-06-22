import {sync_manager} from './namespaces/sync_manager';
import {interface_handler} from './rpc_interface/interface_handler';
import {database_handler} from './postgres/database_handler';
import {confirmed_deposit, unconfirmed_deposit, confirmed_withdraw, unconfirmed_withdraw, mempool_deposit, mempool_withdraw} from './events';
import express from "express";
import bodyParser from 'body-parser';
import * as crypto from 'crypto';
import API from './api/api';
const hpp = require('hpp');
const helmet = require('helmet');
const contentLength = require('express-content-length-validator');
const cors = require("cors");  
const app = express();
let secret = '';

const confirmed_deposit_event = new confirmed_deposit();
const unconfirmed_deposit_event = new unconfirmed_deposit();
const confirmed_withdraw_event = new confirmed_withdraw();
const unconfirmed_withdraw_event = new unconfirmed_withdraw();
const mempool_deposit_event = new mempool_deposit();
const mempool_withdraw_event = new mempool_withdraw();

var rpc = new interface_handler();
var database = new database_handler('postgres', 'Password123', 'localhost', 5432, 'aucrypto', confirmed_deposit_event, unconfirmed_deposit_event, confirmed_withdraw_event, unconfirmed_withdraw_event, mempool_deposit_event, mempool_withdraw_event);
var sync = new sync_manager(rpc, database, confirmed_deposit_event, unconfirmed_deposit_event, confirmed_withdraw_event, unconfirmed_withdraw_event, mempool_deposit_event, mempool_withdraw_event);

sync.startFullSync();

//**  Security Middleware */
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.use(hpp());
app.use(cors());
app.use(helmet());
app.use(helmet.hidePoweredBy({setTo: 'Vodka'}));
app.use(contentLength.validateMax({max: 9999, status: 400, message: "I see how it is. watch?v=ewRjZoRtu0Y"}));


function authenticationMiddleware(req:any, res:any, next:any) {
    const payload = JSON.stringify(req.body);
    if(!payload){
        return next('Request body empty');
    }

    const hmac = crypto.createHmac('sha1', secret);
    const digest = 'sha1=' + hmac.update(payload).digest('hex');
    const checksum = req.get('X-INTER-AUCRYPTO-VERIF');
    if(!checksum || !digest || checksum !== digest) {
        return next('Request body digest did not match verification.');
    }
    return next();
}

app.post('/address', authenticationMiddleware, (req, res) => {
    if(!req.body.invoiceId) return res.status(403).send({error: 'Request body was invalid.'});
    let invoiceId = req.body.invoiceId;
    if(isNaN(invoiceId)) return res.status(403).send({error: 'Request body was invalid.'});
    
    rpc.getNewAddress(invoiceId).then((address) => {
        res.json({address: address});
    })
});

app.use((err:any, req:any, res:any, next:any) => {
    res.status(403).send('Request body was not signed or verification failed');
});

app.listen(2001, '127.0.0.1', async () => {
    //Login with AUCRYPTO_TRANSACTION
    let API_HANDLER = new API();
    let session = await API_HANDLER.loginServer();
    if(session !== '') {
        secret = session;
    }else {
        console.log('Failed to logged to AUCRYPTO_TRANSACTION server.');
    }
    console.log('AUCRYPTO - NodeListener started → PORT 2001');
});
