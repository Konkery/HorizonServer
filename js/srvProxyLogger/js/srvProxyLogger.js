const ClassBaseService_S = require('./../../srvService/js/srvService');

const EVENT_SYSBUS_LIST = ['all-init-stage1-set'];
const EVENT_LOGBUS_LIST = ['logger-proxy'];
const BUS_NAMES_LIST = ['sysBus', 'logBus'];

/**
 * @class
 * Класс предоставляет инструменты для логирования 
 */
class ClassProxyLogger extends ClassBaseService_S {
    #_SubNodes;
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        super({ _name: 'proxylogger', _busNameList: BUS_NAMES_LIST, _busList, _node });
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList('logBus', EVENT_LOGBUS_LIST);
        this.#_SubNodes = {};

        this.EmitEvents_logger_log({level: 'INFO', msg: 'Proxy Logger initialized.'});
    }
     /**
     * @method
     * @description
     * Подписывает узел Node-RED логгера, для возможности передачи сообщения в узлы debug
     * @param {Object} _opts     - Объект с информацией для подписки
     */
     Subscribe(_opts) {
        if (typeof (this.#_SubNodes[_opts.flowname]) !== 'undefined') {
            if (this.#_SubNodes[_opts.flowname].debug != _opts.debug) {
                this.#_SubNodes[_opts.flowname].debug = _opts.debug;
                this.EmitEvents_logger_log({level: 'W', msg: `Node ${this.#_SubNodes[_opts.flowname].name} switched debug!`, obj: _opts});
                return;
            }
            else {
                const resp = {payload: {
                    dest: 'log',
                    com: 'log-already-subbed',
                    arg: [],
                    value: [`Node ${_opts.node.name} already subscribed!`]
                    },
                    topic: 'Subscribtion error'
                };
                if (_opts.debug) {_opts.node.send(resp)};
                this.EmitEvents_logger_log({level: 'W', msg: `Node ${_opts.node.name} already subscribed!`, obj: _opts});
            }
            return;
        }
        this.EmitEvents_logger_log({level: 'INFO', msg: `"${_opts.node.name}/${_opts.flowname}" subscribed`});
        _opts.node.debug = _opts.debug;
        this.#_SubNodes[_opts.flowname] = _opts.node;
    }
     /**
     * @method
     * @description
     * Ощусетвляет логирование сообщений из User Space
     * @param {Object} _logs     - Объект с информацие для подписки
     */
    Log(_logs) {
        try {
            if (_logs.env == undefined) {
                this.EmitEvents_logger_log({level: _logs.level, msg: _logs.msg, obj: {obj: _logs.obj ?? {}, module: _logs.module ?? 'UserSpace'}});
            }
            else {
                const node_name = _logs.env.get("NR_NODE_NAME");
                const flow_name = _logs.env.get("NR_FLOW_NAME");
                this.EmitEvents_logger_log({level: _logs.level, msg: _logs.msg, obj: {obj: _logs.obj || {}, node: node_name, flow: flow_name, module: _logs.module ?? 'UserSpace'}});
                if (this.#_SubNodes[flow_name].debug) {
                    const resp = {payload: _logs.msg,
                        topic: 'Log message'
                    };
                    this.#_SubNodes[flow_name].send(resp);
                }
            }
            
        }
        catch (e) {
            this.EmitEvents_logger_log({level: 'W', msg: `Cannot send message: ${e}`, obj: _logs});
        }
    }
}
module.exports = ClassProxyLogger;