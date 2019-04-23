declare function require(name:string);
import {Pool, PoolClient} from 'pg';
import {Block} from '../namespaces/block';
import {Transaction} from '../namespaces/transaction';


/*

-- Table: public.blocks

-- DROP TABLE public.blocks;

CREATE TABLE public.blocks
(
    height integer NOT NULL,
    hash character varying(70) COLLATE pg_catalog."default" NOT NULL,
    size smallint,
    version smallint,
    versionhex character varying(50) COLLATE pg_catalog."default",
    merkleroot character varying(70) COLLATE pg_catalog."default",
    "time" integer,
    nonce integer,
    chainwork character varying(70) COLLATE pg_catalog."default",
    totalsent numeric(18,8),
    totalrecieved numeric(18,8),
    totalfee numeric(18,8),
    totaltransactions smallint,
    CONSTRAINT blocks_pkey PRIMARY KEY (height, hash)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.blocks
    OWNER to postgres;

    */

/*
-- Table: public.transactions

-- DROP TABLE public.transactions;

CREATE TABLE public.transactions
(
    transactionid character varying(70) COLLATE pg_catalog."default" NOT NULL,
    version smallint,
    size smallint,
    totalsent numeric(18,8),
    totalrecieved numeric(18,8),
    totalfee numeric(18,8),
    senders json,
    receivers json,
    CONSTRAINT transactions_pkey PRIMARY KEY (transactionid)
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

ALTER TABLE public.transactions
    OWNER to postgres;

    */
   
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
                await poolClient.query('INSERT INTO blocks(height, hash, size, version, versionhex, merkleroot, time, nonce, chainwork, totalSent, totalrecieved, totalfee, totaltransactions) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
                [block.getBlockHeight(), block.getBlockHash(), block.getBlockSize(), block.getBlockVersion(), block.getBlockVersionHex(), block.getBlockMerkleRoot(), block.getBlockTime(), block.getBlockNonce(), block.getBlockChainwork(), block.getTotalSent(), block.getTotalRecieved(), block.getTotalFee(), block.getTransactions().length]);
                resolve(true);
            } catch (e) {
                resolve(false);
            }
        });
    }

    private insertTransactionQuery(poolClient:PoolClient, transaction:Transaction):Promise<boolean> {
        return new Promise<boolean>(async (resolve, rejct) => {
            try {
                await poolClient.query
                resolve(true);
            } catch (e) {
                resolve(false);
            }
        });
    }

}