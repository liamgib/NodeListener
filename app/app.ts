import {sync_manager} from './namespaces/sync_manager';
import {interface_handler} from './rpc_interface/interface_handler';
import {database_handler} from './postgres/database_handler';
var rpc = new interface_handler();
var database = new database_handler('postgres', 'Password123', 'localhost', 5432, 'aucrypto');
var sync = new sync_manager(rpc, database);

sync.startFullSync();