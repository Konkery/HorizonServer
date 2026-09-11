const ClassBaseService_S = require('./../../srvService/js/srvService');
const ClassGlog2 = require('graylog2');
const dgram = require('dgram');

const EVENT_SYSBUS_LIST = ['all-init-stage1-set'];
const EVENT_LOGBUS_LIST = ['logger-log'];
const EVENT_MDBBUS_LIST = [''];
const EVENT_DATABUS_LIST = [''];
const BUS_NAMES_LIST = ['sysBus', 'logBus', 'mdbBus', 'dataBus'];
/**
 * @class
 * Класс предоставляет инструменты для логирования 
 */
class ClassLogger extends ClassBaseService_S {
    #_WriteToConsole;
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }, options) {
        super({ _name: 'logger', _busNameList: BUS_NAMES_LIST, _busList, _node });
        this._gl = new ClassGlog2.graylog({
            servers: [
                { 'host': options.host || '127.0.0.1', 'port': options.port || 5141 }
            ],
            hostname: options.hostname || 'hubc445',       // the name of this host
            facility: options.facility || 'HorizonServer', // the facility for these log messages
            bufferSize: 1350         // max UDP packet size, should never exceed the
        }); // объект взаимодействия с грейлогом, должен быть создан при ините, затем используется его метод для записи в грейлог
        this._us = new ClassGlog2.graylog({
            servers: [
                { 'host': options.host || '127.0.0.1', 'port': 5143 }
            ],
            hostname: options.hostname || 'Node-RED',       // the name of this host
            facility: options.facility || 'UserSpace', // the facility for these log messages
            bufferSize: 1350         // max UDP packet size, should never exceed the
        }); // объект взаимодействия с грейлогом, должен быть создан при ините, затем используется его метод для записи в грейлог
        this._WriteToConsole = options.console || false;
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList('logBus', EVENT_LOGBUS_LIST);
        this.ListenPort(options.listen ?? false);

        this.EmitEvents_logger_log({level: 'INFO', msg: 'Logger initialized.', obj: this._gl.config});
    }
    set _WriteToConsole (opt) {
        if (typeof opt === 'boolean') {
            this.#_WriteToConsole = opt;
        }
    }
    EmitEvents_logger_proxy(_msg) {
        const msg = {
            dest: 'proxylogger',
            com: 'logger-proxy',
            arg: [],
            value: [_msg]
        }
        this.EmitMsg('logBus', msg.com, msg);
    }
    /**
     * @method
     * @description
     * Возвращает строку с датой и временем в установленном формате
     * @returns datetime        - строка с датой и временем         
     */
    GetSystemTime() {
        let date = new Date(); 
        let datetime = (date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).substr(-2) +
        "-" + ("0" + date.getDate()).substr(-2) + " " + ("0" + date.getHours()).substr(-2) +
        ":" + ("0" + date.getMinutes()).substr(-2) + ":" + ("0" + date.getSeconds()).substr(-2));

        return datetime;
    }
    /**
     * @method
     * @description
     * Записывает сообщение в БД и выводит её в консоль
     * @param {Object} _msg      - Объект сообщения, содержащий необходимые данные от источника для передачи в Грейлог
     */
    HandlerEvents_logger_log(_topic, _msg) {
        let flevel = -1;
        let fdesc = 'Unknown';
        const logdesc = ['CRITICAL', 'ERROR', 'WARNING', 'NOTICE', 'INFO', 'DEBUG'];
        const level = logdesc.indexOf(logdesc.find((lvl) => lvl.startsWith(_msg.arg[0].toUpperCase())));
        if (level != -1) {
            fdesc = logdesc[level];
            flevel = level+2;
        }
        const msg = _msg.value[0] || 'NoMessage';
        const obj = _msg.value[1] || {};
        const source = _msg.metadata.source;

        // Запись в грейлог        
        if (source != 'proxylogger') {
            this._gl._log(`${msg}`, obj, {level_desc: fdesc, service: source, service_bus: 'logBus'}, 0.0, flevel);
        }
        else {
            this._us._log(`${msg}`, obj, {level_desc: fdesc, service: source, service_bus: 'logBus', node: obj.node ?? {}, flow: obj.flow ?? {}, module: obj.module ?? {}}, 0.0, flevel);
        }
        if (this.#_WriteToConsole) {
            const meta = `${this.GetSystemTime()} [${source}.${'logBus'}] -> ${fdesc} | ${msg}`;
            console.log(meta);
        }
    }

    ListenPort( _listen ) {
        if (_listen) {
            const socket = dgram.createSocket({type: 'udp4'});
    
            socket.on('message', (msg) => {
                console.log(JSON.parse(msg.toString()));
                //this._gl._log(msg);
            });
            
            socket.on('listening', () => {
                console.log('Listening');
            });
            
            socket.bind(44999);
        }
    }
    
}
module.exports = ClassLogger;