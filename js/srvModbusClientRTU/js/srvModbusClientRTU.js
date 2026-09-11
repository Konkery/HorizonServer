const ClassModbusBase_S = require('./../../srvModbusBase/js/srvModbusBase');

const CONNECTION_TIMEOUT = 1000;
const THIS_NAME = 'modbusclientrtu';


class ModbusClientRTU extends ClassModbusBase_S {
    #_Protocol;
    /**
     * @constructor
     * @description
     * Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol }) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus'], _busList, _node, _type: 'RTU' });
        this.#_Protocol = _protocol;
    }
    
    /**
     * @method
     * @description Обработчик события, запускает отправку сообщения по указанному сокету
     * @param {String} _topic       - топик сообщения 
     * @param {Object} _msg         - само сообщение
     */
    HandlerEvents_modbusclientrtu_send(_topic, _msg) {
        const [source_name] = _msg.arg[0];
        const chNum = _msg.arg[1];
        const [value] = _msg.value;
        const [val] = value.value;
       
        this.Modbus_client_send(source_name, chNum, val);
    }

    /**
     * @method
     * @description Инициализирует соединение с источниками
     */
    Connect() {
        let sourcesCount = 0;
        let tOut = setTimeout(() => {
            this.EmitEvents_logger_log({level: 'I', msg: `Connections done by modbusRTU!`});
            this.Start_sensor_reading();
        }, CONNECTION_TIMEOUT);
        Object.values(this.SourcesState)
            .filter(source => source.Protocol === this.#_Protocol && !source.IsConnected && source.CheckProcess && source.Status === 'active')
            .forEach((source) => {
                this.Add_new_source(source, {dest: 'proxymodbusrtu', com: 'proxymodbusrtu-msg-get'});
                sourcesCount++;
        });
        if (sourcesCount == 0) {
            clearTimeout(tOut);
            this.EmitEvents_logger_log({level: 'I', msg: `No unconnected sources found!`});
        }
    }
}

module.exports = ModbusClientRTU;