const ClassBaseProxyModbus = require('./../../srvProxyModbusBase/js/srvProxyModbusBase');

const THIS_NAME = 'proxymodbusrot';

class ProxyModbusROT extends ClassBaseProxyModbus {
    #_Protocol;
    /**
     * @constructor
     * @description
     * Конструктор класса
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _primaryBus, _node, _protocol }) {
        super({ _name: THIS_NAME, _busNameList: ['sysBus', _primaryBus, 'logBus'], _primaryBus, _protocol, _busList, _node, _type: 'ROT' });
        this.#_Protocol = _protocol;
    }

    /**
     * @method
     * @description Отправляет службе modbusclientrot топик и значение, которое требуется записать
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
    HandlerEvents_proxymodbusrot_send( _topic, _msg ) {
        this.Modbus_send_message(_topic, _msg);
    }
    /**
     * @method
     * @description Обновляет значение канала
     * @param {Object} _topic         - Топик сообщения 
     * @param {Object} _msg           - Сообщение
     */
    HandlerEvents_proxymodbusrot_msg_get( _topic, _msg ) {
        this.Modbus_get_message(_topic, _msg);
    }
}

module.exports = ProxyModbusROT;