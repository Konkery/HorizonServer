const ClassBaseService_S = require('srvService');
//const ClassBaseService_S = class {};
const EVENT_INIT = 'all-init';
const EVENT_REGISTER = 'register';
const EVENT_WSC_RECEIVE     = 'pwsc-receive';
const EVENT_PWS_CREATED     = 'pwsc-created';
const EVENT_CONNS_DONE      = 'proc-connections-done';
const EVENT_WSC_MSG_RETURN  = 'wsc-msg-return';
const EVENT_PWSC_MSG_RETURN = 'pwsc-msg-return';
const EVENT_PWSC_SEND       = 'pwsc-send';

/** Новые команды */
const COM_PWSC_SEND = 'send';
const COM_PWSC_RECEIVE = 'receive';

const BUS_NAMES_LIST = ['sysBus', 'logBus', 'lhpBus'];

const LHP = {
    /**
     * @typedef Command
     * @property {string} com - строковое представление команды
     * @property {[any]} arg - аргументы
     */
    /**
     * @method
     * Метод формирует LHP-пакет из полученной команды 
     * @param {Command} com
     * @returns {object}
     */
    Pack(com) {
        // TODO: реализовать получение ID и TimeStamp
        const msg = { 
            "TimeStamp": 122465768,
            "MetaData": {                   
                "Type":     "server",
                "ID":       "MAS-M008",
                "Command":  [ com ]
            },
            "Value": ""
        };
        msg.MetaData.CRC = Math.random()*1111    //расчет чексуммы
        return msg;
    },
    Unpack(_data, _sourceId) {
        let obj = null;
        try {
            obj = JSON.parse(_data);
        } catch (e) {
            throw new err('Incorrect JSON data');
        }
        
        let meta_crc = obj.MetaData.CRC;    //чексумма, полученная из пакета
        delete obj.MetaData.CRC;
        let service = obj.MetaData.RegServices;
        let comObj = obj.MetaData[service];
        return comObj;
    }
}

/**
 * @class является придатком WS Client и реализует 
 * - передачу сообщений, полученных от WSC, системным службам  
 * - обработку запросов и сообщений со сторону служб 
 */
class ClassProxyWSClient extends ClassBaseService_S {
    #_SourcesState;
    /**
     * @constructor
     * @param {[ClassBus_S]} busList - список шин, созданных в проекте
     */
    constructor({ busList, node }) {
        // передача в супер-конструктор имени службы и списка требуемых шин
        super({ name: 'ProxyWSClient', busNamesList: BUS_NAMES_LIST, busList, node });
        /**
         * @event
         * Получение LHP пакета от WS клиента
         * @param {string} msg - JSON-строка
         * @param {string} sourceKey - первоначальный идентификатор соединения
         */
        this._BusList.sysBus.on(EVENT_WSC_MSG_RETURN, this.#Receive.bind(this));

        /**
         * @event
         * Запрос на отправку данных по WS соединению
         * @param {object} command 
         * @param {string} sourceName - имя соединения
         */
        this._BusList.sysBus.on(EVENT_PWSC_SEND, (command, sourceName) => {
            console.log(`PWSC | ${EVENT_PWSC_SEND}    ${command}`);
            const msg = LHP.Pack(command);
            this.#SendOnWSC(msg, sourceName);
        });
    }

    /**
     * @typedef InitOpts
     * @property {HrzBus} sysBus
     * @property {object} SourcesInfo
     */
    /**
     * @method
     * @description Сохраняет ссылки на используемые шины, информацию об источниках и инициализирует базовые обработчики
     * @param {InitOpts} arg - объект со ссылками на внешние зависимости 
     */
    async HandlerInit1({ ServicesState, SourcesState }) {
        super.HandlerInit1(arguments);
        if (this._BusList.lhpBus) {
            /* future ver
            this.AddComHandler('lhpBus', COM_PWSC_RECEIVE, this.#Receive.bind(this));
            this.AddComHandler('lhpBus', COM_PWSC_SEND, this.#SendOnWSC.bind(this));
            */
        }
    }

    /**
     * @method 
     * Вызывается при обработке события 'ws-receive'
     * @param {string} _data - JSON-строка в LHP-формате
     * @param {string} _sourceId - id/name отправителя
     */
    #Receive(_data, _sourceId) {
        const { com, arg } = LHP.Unpack(_data);
        console.log(`DEBUG>> com ${com} arg ${arg}`);

        if (com.endsWith('-raw')) {
            this._BusList.sysBus.emit(`${_sourceId}-${com}`, arg[0]);
        } else {
            this._BusList.sysBus.emit(com, arg, _sourceId);
            // this.SendMsg('lhpBus', { payload: { com, arg, source: _sourceId }});
        }
    }

    /**
     * @method
     * Отправляет сообщение в виде JSON-строки на WS Client
     * @param {string} data сообщение 
     */
    #SendOnWSC(msg, sourceName) {
        // TODO: актуализировать интерфейс взаимодействия
        this._BusList.sysBus.emit(EVENT_PWSC_MSG_RETURN, JSON.stringify(msg), sourceName);
        /**future ver 
        // this.SendMsg('lhpBus', { topic: EVENT_PWSC_MSG_RETURN, payload: {
        //     com: EVENT_PWSC_MSG_RETURN,
        //     arg: [sourceName],
        //     val: [JSON.stringify(msg)]
        // }});   
        */               
    }
}

module.exports = ClassProxyWSClient;

