const EVENT_WSC_RECEIVE = 'pwsc-receive';
const EVENT_PWSC_SEND = 'pwsc-send';
const EVENT_PWS_CREATED = 'pwsc-created';
const EVENT_CONNS_DONE = 'proc-connections-done';

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

module.exports = () => { 
/**
 * @class является придатком WS Client и реализует 
 * - передачу сообщений, полученных от WSC, системным службам  
 * - обработку запросов и сообщений со сторону служб 
 */
class ProxyWSClient {
    #_SystemBus;

    constructor(_opts = { saveRawData: false }) {
        this._SaveRawData = _opts.saveRawData; 
    }

    Init({ SystemBus }) {
        // Process передал список подключений, по которым будет выполнен запрос на получение списка каналов 
        this.#_SystemBus.on(EVENT_CONNS_DONE, (sourcesInfo) => {
            this._SourcesInfo = sourcesInfo;
        });
        /**
         * @event
         * Получение LHP пакета от WS клиента
         * @param {string} msg - JSON-строка
         * @param {string} sourceKey - первоначальный идентификатор соединения
         */
        SystemBus.on(EVENT_WSC_RECEIVE, (msg, sourceKey) => {
            const sourceName = this._SourcesInfo._collection.find(conn => conn._hKey == sourceKey)._sourceName;
            this.#Receive(msg, sourceName);
        });

        /**
         * @event
         * Запрос на отправку данных по WS соединению
         * @param {object} command 
         * @param {string} sourceName - имя соединения
         */
        SystemBus.on(EVENT_PWSC_SEND, (command, sourceName) => {
            const sourceKey = this._SourcesInfo._collection.find(conn => conn._sourceName == sourceName)._hKey;
            const msg = LHP.Pack(command);
            this.#Send(msg, sourceKey);
        });

        SystemBus.emit(EVENT_PWS_CREATED, this);
    }

    /**
     * @method 
     * Вызывается при обработке события 'ws-receive'
     * @param {string} _data - JSON-строка в LHP-формате
     * @param {string} _sourceId - id/name отправителя
     */
    #Receive(_data, _sourceId) {
        const { com, arg } = LHP.Unpack(_data);

        if (com.endsWith('-raw')) {
            SystemBus.emit(`${_sourceId}-${com}`, arg[0]);
            if (this._SaveRawData) ProxyDB.WriteRaw({ id: com.slice(0, -4), value: arg[0] });
        } else {
            SystemBus.emit(com, arg, _sourceId);
        }

    }
    /**
     * @method
     * Отправляет сообщение в виде JSON-строки на WS Client
     * @param {string} data сообщение 
     */
    #Send(msg, sourceKey) {

        // TODO: актуализировать интерфейс взаимодействия
        // WSС.Send(JSON.stringify(msg), sourceKey);                            
    }
}
return ProxyWSClient;

}