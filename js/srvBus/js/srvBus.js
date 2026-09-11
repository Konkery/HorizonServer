const { ClassBusMsg_S } = require('./../../srvBusMsg/js/srvBusMsg');
const EventEmitter = require('eventemitter2');
// const zmq = require("zeromq");
const { execSync } = require('child_process');
const os = require('os');
/**
 * @class
 * Класс шины.
 * Наследует EventEmitter. 
 */
class ClassBus_S extends EventEmitter {

    static #_BusInstances = [];
    #_Name;
    #_DebugOn = false;

    /**
     * @constructor
     * @param {string} _name - имя шины
     */
    constructor(_name) {
        // реализация Singleton
        const instance = ClassBus_S.#_BusInstances.find(bus => bus.Name == _name);
        if (instance instanceof ClassBus_S) return instance;

        super();
        if (typeof _name === 'string')
            this.#_Name = _name;
        else
            new Error('Invalid args');
        // 
        ClassBus_S.#_BusInstances.push(this);
        this.ipcout = null;
        this.ipcout = null;
        this.setMaxListeners(100);
    }

    /**
     * @getter
     * Имя шины
     */
    get Name() {
        return this.#_Name;
    }

    /**
     * @getter
     * Флаг указывающий на то, будут ли сообщения перенаправляться на logBus
     */
    get DebugOn() {
        return this.#_DebugOn;
    }

    /**
     * @getter
     * Флаг указывающий на то, будут ли сообщения перенаправляться на logBus
     */
    set DebugOn(flag) {
        this.#_DebugOn = flag;
    }
    
    /*async StartIPC() {
        this.socket = new zmq.Pair();
        this.socket.bindSync(this.#GetSocketsPath().tx);
        await this.socket.receive(); 

        this.on('*', async (com, ...args) => {
            await this.socket.send([com, ...args]);
        });

        for await (let [com, ...args] of this.socket) {
            this.emit(com, ...args);
        }
    }*/
    async StartIPC() {
        const KEEP_ALIVE_TIMEOUT = 3000;
        const PING_TOPIC = 'ping';
        const MSG_TOPIC = 'msg';
        const { tx, rx } = this.#GetSocketsPath();

        this.ipcout = new zmq.Publisher();
        this.ipcin = new zmq.Subscriber();
        
        this.ipcout.bindSync(tx);
        this.ipcin.connect(rx);
        this.ipcin.subscribe(''); //(["ping", "msg"]);
        
        // await this.ipcin.receive();
        let isAlive = false;
        let isAliveTimer = null;
        // pipe bus <- socket
        for await (let [com, data] of this.ipcin) {
            isAlive = true;
            if (isAliveTimer) clearTimeout(isAliveTimer);
            timer = setTimeout(() => {
                isAlive = false;
            }, KEEP_ALIVE_TIMEOUT);
            
            if (com != PING_TOPIC) {
                const msg = this.#CreateMsg(JSON.parse(data));
                if (msg)
                    this.emit(msg.com, msg);
            }
        }
        // pipe this bus -> socket
        this.on('*', async (com, msg) => {
            if (!isAlive) return;
             
            let data = JSON.stringify(msg);
            if (data.length)
                await this.ipcout.send([MSG_TOPIC, data]);
        });
    }
    /**
     * @method
     * @public
     * @description создает и возвращает объект сообщения
     * @description Создает объект класса BusMsg
     * @param {TypeMsgOpts} _msgOpts
     * @returns
     */
    #CreateMsg(_msgOpts) {
        try {
            // преобразование объекта сообщения
            _msgOpts.source = this.Name;
            return new ClassBusMsg_S(_msgOpts);
        } catch (e) {
            this.EmitEvents_logger_log({ level: 'E', msg: `BusMsg | ${e}` });
            return null;
        }
    }

    #GetSocketsPath() {
        const { username } = os.userInfo();
        return this.#IsClient() ? ({
            tx: `ipc:///tmp/${this.Name}_rx_${username}.ipc`,
            rx: `ipc:///tmp/${this.Name}_tx_${username}.ipc`
        }) : ({
            tx: `ipc:///tmp/${this.Name}_tx_${username}.ipc`,
            rx: `ipc:///tmp/${this.Name}_rx_${username}.ipc`
        });

    }

    #IsClient() {
        const { username } = os.userInfo();
        // Unix/Linux/MacOS
        let command = `pgrep -u ${username} -f ${targetName}`;
        const output = execSync(command, { encoding: 'utf8' });
        const pid = output.trim().split('\n')[0];
        return pid == process.pid;
    }
}

module.exports = ClassBus_S;

