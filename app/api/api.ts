const fetch = require('node-fetch');
const settings = require('../config/settings.json');
const AUCRYPTO_TRANSACTION = 'http://0.0.0.0:3001';
import crypto from "crypto";
import { database_handler } from "../postgres/database_handler";
export default class API {
   

    private session:string;
    private database:database_handler;

    constructor(database:database_handler) {
        this.database = database;
    }

    public loginServer():Promise<string> {
        return new Promise<string>((resolve) => {
            fetch(`${AUCRYPTO_TRANSACTION}/server/login`, {
                method: 'post',
                body: JSON.stringify({serverId: settings.SERVER_ID, serverKey: settings.ACCESS_KEY}),
                headers: { 'Content-Type': 'application/json' }
            }).then((res:any) => res.json())
            .then((json:any) => {
                if(json.loggedIn) this.session = json.session;
                if(json.loggedIn) return resolve(json.session);
                return resolve('');
            }).catch((err:any) => {
                return resolve('');
            });
        });
    }


    public relayUpdate(eventType:string, data:any, isRetry=false):Promise<boolean> {
        return new Promise<boolean>(async (resolve) => {
            try {
                const hmac = crypto.createHmac('sha1', this.session);
                const digest = 'sha1=' + hmac.update(JSON.stringify({eventType: eventType, ...data})).digest('hex');
                fetch(`${AUCRYPTO_TRANSACTION}/webhook/invoiceUpdate`, {
                    method: 'post',
                    body: JSON.stringify({eventType: eventType, ...data}),
                    headers: { 'Content-Type': 'application/json', 'X-INTER-AUCRYPTO-SERV': settings.SERVER_ID, 'X-INTER-AUCRYPTO-VERIF': digest }
                }).then((res:any) => res.json())
                .then(async (json:any) => {
                    if(json.error !== undefined) {
                        if(isRetry == true) {
                            //Save into db to retry.
                            this.database.saveFailedTransactionUpdate({eventType: eventType, ...data}, json.error);
                            return resolve(false);
                        }else{
                            //Retry
                            let retry = await this.relayUpdate(eventType, data, true);
                            return resolve(retry);
                        }
                    } else {
                        return resolve(true);
                    }
                }).catch(async (err:any) => {
                    if(isRetry == true) {
                        //Save into db to retry.
                        this.database.saveFailedTransactionUpdate({eventType: eventType, ...data}, err);
                        return resolve(false);
                    }else{
                        //Retry
                        let retry = await this.relayUpdate(eventType, data, true);
                        return resolve(retry);
                    }
                });
            } catch(err) {
                if(isRetry == true) {
                    //Save into db to retry.
                    this.database.saveFailedTransactionUpdate({eventType: eventType, ...data}, err);
                    return resolve(false);
                }else{
                    //Retry
                    let retry = await this.relayUpdate(eventType, data, true);
                    return resolve(retry);
                }
            }
        });
    }
}