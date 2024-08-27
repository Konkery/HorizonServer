const { exec } = require("child_process");
const ClassBaseService_S = require("../../../SrvService/js/module/srvService");
const COM_GET_DEVLIST  = 'dm-deviceslist-get';
const COM_GET_HUB_DATA = 'hub-get-data';
const EVENT_INIT = 'all-init';
const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus'];

/**
 * @class
 * Реализует функционал прокси к функциональным узлам, собирающим данные о хабе
 */
class ClassProxyHub_S extends ClassBaseService_S {
    #_HubName;
    #_ChList;
    _BusList = [];
    /**
     * @constructor
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     * @param {[string]} chList - список каналов хаба 
     */
    constructor(_busList, chList) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super('ProxyHub', BUS_NAMES_LIST, _busList);
    
        this.#_ChList = chList;
        
        // подписка на init
        this._BusList.sysBus.on(EVENT_INIT, this.InitHandler.bind(this));
    }

    /**
     * @getter
     * Имя хаба (hostname)
     */
    get HubName() { return this.#_HubName; }
    
    /**
     * @method
     * Метод для приема сообщений по Node-red связям
     * @param {object} msg 
     */
    ReceiveNR({topic, payload }) {
        // TODO: контроль вх.сообщений
        this.#ReceiveHandler({ topic, payload });
    }
    
    /**
     * @method
     * Принимает данные, полученные от источника сбора показаний хаба 
     * @param {*} _msg 
     */
    #ReceiveHandler({ topic, payload: { com, arg }}) {
        //'dm-...' | chId | val
        const { com, arg, val } = payload;
        console.log(`ProxyHub | com ${com} arg ${arg}`);

        // если топик формата 00-01-raw, то сообщение пересылается на lhpBus специфичным образом
        if (top.endsWith('-raw')) {
            this._BusList.lhpBus.emit(`${this.#_HubName}-${topic}`, val[0]);
        } else {
            // в общем случае задается source сообщения и оно триггерится по payload
            payload.source = this.#_HubName;
            this._BusList.lhpBus.emit(top, payload);
        }
    }

    /**
     * @method
     * возвращает имя хоста при успешном выполнении команды `hostname` 
     * @returns 
     */
    async #GetHubName() {
        return new Promise((res, rej) => {
            exec('hostname', (err, stdout, stderr) => {
                if (err) {
                    // logBus.emit('err')
                    rej(err);
                } else {
                    res(stdout);
                }
            });
        });
    }

    async InitHandler({ ServicesState }) {
        super.InitHandler(arguments);

        this._sysBus.on(COM_GET_DEVLIST, this.GetDevlistHandler.bind(this));
        // считывание имени
        this.#_HubName = this.#GetHubName() ?? 'unknown';
    }

    /**
     * @method
     * Обработчик запроса на список каналов
     */
    async GetDevlistHandler() {
         this._BusList.lhpBus.emit(COM_GET_DEVLIST, [...this.#_ChList]);
    }
}

module.exports = ClassProxyHub_S;