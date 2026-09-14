const ClassBaseService_S = require('./../../srvService/js/srvService');
const EventEmitter = require('eventemitter2');

const EVENT_SYSBUS_LIST = ['all-init-stage1-set'];
const EVENT_DATABUS_LIST = ['all-data-fine-set', 'all-ch-new'];
const BUS_NAMES_LIST = ['sysBus', 'logBus', 'dataBus'];
/**
 * @class
 * Класс предоставляет инструменты для логирования 
 */
class ClassProxyChannel extends ClassBaseService_S {
    #_SubChannels = [];
    #_Channels = [];
    #_Events = {};
    /**
     * @constructor
     * @description
     * Конструктор класса логгера
     * @param {[ClassBus_S]} _busList - список шин, созданных в проекте
     */
    constructor({ _busList, _node }) {
        super({ _name: 'proxychannel', _busNameList: BUS_NAMES_LIST, _busList, _node });
        this.FillEventOnList('sysBus', EVENT_SYSBUS_LIST);
        this.FillEventOnList('dataBus', EVENT_DATABUS_LIST);
        this.#_Events = new EventEmitter();

        this.EmitEvents_logger_log({level: 'INFO', msg: 'Proxy channel initialized.'});
    }

    get Channels() {
        return this.#_Channels;
    }

    get Events() {
        return this.#_Events;
    }
    /**
     * @method
     * @description
     * Получает объект Node-RED через которую передаются сообщения из логгера
     * @param {Object} _opts     - Объект с информацие для подписки   
     */
    Subscribe(_opts) {
        if (!this.ServicesState) {
            const resp = {payload: {
                dest: 'chio',
                com: 'chio-not-ready',
                arg: [],
                value: [`Cannot subscribe ${_opts.chName}. System startup in process`]
                },
                topic: 'Subscription error'
            };
            _opts.node.send(resp);
            return;
        }
        /*if (typeof (this.#_SubChannels.find(channel => channel.node == _opts.node)) !== 'undefined') {
            const resp = {payload: {
                dest: 'chio',
                com: 'chio-already-subbed',
                arg: [],
                value: [`Node ${_opts.node.name} already subscribed!`]
                },
                topic: 'Subscription error'
            };
            _opts.node.send(resp);
            return;
        }*/
        if (!(_opts.chName in this.ServicesState)) {
            const resp = {payload: {
                dest: 'chio',
                com: 'chio-no-channel',
                arg: [],
                value: [`Channel with name ${_opts.chName} doesn't exist!`]
                },
                topic: 'Subscription error'
            };
            _opts.node.send(resp);
            return;
        }
        if (this.ServicesState[_opts.chName].Status !== 'running') {
            const resp = {payload: {
                dest: 'chio',
                com: 'chio-not-running',
                arg: [`Status: ${this.ServicesState[_opts.chName].Status}`],
                value: [`Channel ${_opts.chName} isn't running!`]
                },
                topic: 'Subscription error'
            };
            _opts.node.send(resp);
            return;
        }
        this.#_SubChannels.push(_opts);
        this.EmitEvents_logger_log({level: 'INFO', msg: `${_opts.node.name} subscribed`});
        const resp = {payload: {
            dest: 'chio',
            com: 'chio-success',
            arg: [`Status: ${this.ServicesState[_opts.chName].Status}`],
            value: [`Channel ${_opts.chName} subscribed!`]
            },
            topic: 'Subscription success'
        };
        _opts.node.send(resp);
    }

    /**
     * @method
     * @description 
     * Получение текущего значения указанного канала
     * @param {String} _chName      - имя канала
     * @returns {Object} val        - значение указанного канала
     */
    GetValue( _chName ) {
        if (this.ServicesState[_chName] != undefined)
            return this.ServicesState[_chName].Service.Value;
        else
            return undefined;
    }

    /**
     * @method
     * @description
     * Установка значения указанного канала
     * @param {String} _chName      - имя канала 
     * @param {Object} _val         - записываемое значение
     * @returns 
     */
    SetValue( _chName, _val ) {
        if (_chName == undefined) {
            this.EmitEvents_logger_log({level: 'W', msg: `Cannot set value: Channel ${_chName} doesn't exist!`});
            return;
        }
        const msg = {
            com: 'all-actuator-set',
            dest: _chName,
            source: 'Node-RED',            
            arg: [_chName],
            value: [_val]
        };
        this.EmitMsg('dataBus', msg.com, msg);
    }//

     /**
     * @method
     * @description
     * Метод для управления каналами актуаторов
     * @deprecated
     * @param {Object} _opts     - Объект с именем канала и значением, которое нужно установить   
     */
    Control(_opts) {
        if (_opts.chName == undefined && _opts.node) {
            _opts.chName = this.#_SubChannels.find(channel => channel.node === _opts.node).chName;
        }
        if (!(_opts.chName in this.ServicesState)) {
            this.EmitEvents_logger_log({level: 'W', msg: `Cannot set value: Channel ${_opts.chName} doesn't exist!`});
            return;
        }

        const msg = {
            com: 'all-actuator-set',
            dest: _opts.chName,
            source: 'Node-RED',            
            arg: [_opts.chName],
            value: [_opts.Value]
        };
        this.EmitMsg('dataBus', msg.com, msg);
    }
    
    /**
     * @method
     * @description
     * Устанавливает трансформационную функцию для указанного канала
     * @param {String} _chName      - имя канала 
     * @param {Function} _func      - трансформационная функция 
     */
    SetTransformFunk( _chName, _func ) {
        const channel = this.ServicesState['dm'].Service.Channels.find(ch => ch.Name == _chName);
        channel.Transform.SetFunc(_func);
    }

    /**
     * @method
     * @description
     * Получает сообзение от созданного канала и сохраняет его характеристики
     * @param {Object} _msg      - Объект сообщения
     */
    HandlerEvents_all_ch_new( _topic, _msg ) {
        let [ch] = _msg.value;
        if(!ch || !ch?.Name)
            return;

        if (!this.#_Channels.includes(ch.Name)) {
            this.#_Channels.push(_msg.value[0]);
        }
        else {
            this.EmitEvents_logger_log({level: 'W', msg: `Channel ${_msg.value.Name} already added to proxy channel array`});
        }
    }

    /**
     * @method
     * @description
     * Получает сообщение от канала и перенаправляет его на соответствующий узел Node-RED
     * @param {Object} _msg      - Объект сообщения с канала
     */
    HandlerEvents_all_data_fine_set(_topic, _msg) {
        this.#_Events.emit(`${_msg.arg[0]}-value`, _msg.value[0]);
        this.#_SubChannels.forEach(channel => {
            if (channel.chName == _msg.arg[0]) {
                let retVal = [];
                channel.ret.forEach(key => {
                    if (Object.keys(_msg.value[0]).includes(key)) {
                        retVal.push(_msg.value[0][key]);
                    }                    
                })
                /*Object.keys(_msg.value[0]).forEach(key => {
                    if (channel.ret.includes(key)) {
                        retVal.push(_msg.value[0][key]);
                    }
                });*/
                const msg = {payload: {
                    dest: channel.node.name,
                    com: 'chio-output',
                    arg: channel.ret,
                    value: retVal
                    },
                    topic: channel.chName
                };
                channel.node.send(msg);
            }
        });
    }
}
module.exports = ClassProxyChannel;