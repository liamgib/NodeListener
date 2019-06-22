const fetch = require('node-fetch');
const settings = require('../config/settings.json');
const AUCRYPTO_TRANSACTION = 'http://0.0.0.0:3001';
export default class API {
   

    public loginServer():Promise<string> {
        return new Promise<string>((resolve) => {
            fetch(`${AUCRYPTO_TRANSACTION}/server/login`, {
                method: 'post',
                body: JSON.stringify({serverId: settings.SERVER_ID, serverKey: settings.ACCESS_KEY}),
                headers: { 'Content-Type': 'application/json' }
            }).then((res:any) => res.json())
            .then((json:any) => {
                if(json.loggedIn) return resolve(json.session);
                return resolve('');
            });
        });
    }
}