declare function require(name:string);
import {Pool, PoolClient} from 'pg';
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';



export class database_handler{
    private pool: Pool;
    constructor(username:string, password:string, host:string, port:number, database:string){
        this.pool = new Pool({
            user: username,
            host: host,
            database: database,
            password: password,
            port: port,
        });
        //Test connection
        this.pool.query('SELECT NOW()', (err, res) => {
            if(err){
                console.error('Error authenticating to Database for pool.');
            }else{
                console.log("Started Database. Server time is " + res.rows[0].now);
            }
        });  
    }

    /**
     * Create the block query, transaction data and update address values.
     * Submit socket update notifications to transaction instance if a relevant address is updated.
     * @param BlockInstance The block instance containing all relevant data.
     */
    public insertBlock(BlockInstance:Block):Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            const client = await this.pool.connect();
            try {
                await client.query('BEGIN')
                await this.insertBlockQuery(client, BlockInstance).then(async result => {
                    if(result == true){
                        await client.query('COMMIT');
                        resolve(true);
                    }else{
                        await client.query('ROLLBACK');
                        reject();
                    }
                })
            } catch(e) {
                await client.query('ROLLBACK');
                reject();
            } finally {
                client.release();
            }
        });
    }

    private insertBlockQuery(poolClient:PoolClient, block:Block):Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {
                await poolClient.query('INSERT INTO blocks(height, hash, size, version, versionhex, merkleroot, time, nonce, chainwork, totalSent, totalrecieved, totalfee) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)',
                [block.getBlockHeight(), block.getBlockHash(), block.getBlockSize(), block.getBlockVersion(), block.getBlockVersionHex(), block.getBlockMerkleRoot(), block.getBlockTime(), block.getBlockNonce(), block.getBlockChainwork(), block.getTotalSent(), block.getTotalRecieved(), block.getTotalFee()]);
                resolve(true);
            }catch (e) {
                resolve(false);
            }
        });
    
    }

}