const { EventEmitter2 } = require("eventemitter2");
const ClassBaseService = require('../../srvService/js/srvService.js');
const PROTOCOL = 'mhbridge';
const MHB_BUS = 'mhbridgeBus';
const BUS_NAME_LIST = ['sysBus', 'logBus', MHB_BUS];
const PROXY_NAME = 'proxymhbridge';
const NAME = 'mhbridge';
const CH_RES_MAX_TIME = 150;
const KEY_ON = 1;
const KEY_OFF = 0;

/**
 * ATTENTION:
 * S{0..3} - index of _BridgeState array
 * * VCC (+)
 * |
 * +--------------------+--------------------+
 * |                    |                    |
 * [ S0 ]                |                   [ S1 ]
 * |               +----+----+               |
 * |               |         |               |
 * +---------------+  Motor  +---------------+
 * |               |         |               |
 * |               +----+----+               |
 * [ S2 ]                |                   [ S3 ]
 * |                    |                    |
 * +--------------------+--------------------+
 * |
 * GND (-)
 */

class ClassModBusHBridge_S extends ClassBaseService {
    #_ListenChannels = false;
    /** @type {Map<string, Array<number>>} */
    _SwState = new Map(); //Array(4).fill();
    #_Events = new EventEmitter2();
    
    // Map для хранения очередей по каждому источнику
    #_CmdQueues = new Map(); 

    constructor({ _busList, _primaryBus, _advOpts }) {
        super({ _name: NAME, _busNameList: [_primaryBus, ...BUS_NAME_LIST], _busList });
        this.PrimaryBus = _primaryBus ?? MHB_BUS;
        this.#_Events = new EventEmitter2();
        this.FillEventOnList('sysBus', ['all-init-stage1-set']);
        this.FillEventOnList(this.PrimaryBus, [`${NAME}-cmd`, `${NAME}-ch-set`]);
    }

    get BridgeState() {
        return this._SwState;
    }

    *Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        };
    }

    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (let source of this.Sources()) {
            this._SwState.set(source.Name, [undefined, undefined, undefined, undefined]);
            this.#_CmdQueues.set(source.Name, Promise.resolve());
        }
        this.#_ListenChannels = true;
    }

    async HandlerEvents_mhbridge_cmd(_topic, msg) {
        const { hash } = msg.metadata;
        const [ sourceName ] = msg.arg;
        const [{ cmd, args, value }] = msg.value;

        // Если источник прислал команду до инициализации, создаем ему очередь
        if (!this.#_CmdQueues.has(sourceName)) {
            this.#_CmdQueues.set(sourceName, Promise.resolve());
        }

        // Оборачиваем логику выполнения в асинхронную функцию
        const task = async () => {
            let error = false;
            try {
                switch (cmd) {
                    case 'Forward':
                        await this.Forward(sourceName, ...args)
                        break;
                    case 'Reverse':
                        await this.Reverse(sourceName, ...args);
                        break;
                    case 'Off':
                        await this.Stop(sourceName, ...args);
                        break;
                }
            } catch (e) {
                console.log(`[HBridge]: error ${e}`);
                error = true;
            }

            let resValue = { ...msg.value[0], error };
            this.EmitEvents_proxymhbridge_res({ hash, arg: [sourceName], value: [resValue] });
        };

        // Добавляем задачу в конец очереди для конкретного источника
        const nextQueue = this.#_CmdQueues.get(sourceName)
            .then(task)
            .catch((err) => {
                console.error(`[${NAME}] Queue execution error for source ${sourceName}:`, err);
            });

        // Сохраняем обновленную цепочку обратно в словарь
        this.#_CmdQueues.set(sourceName, nextQueue);
    }

    HandlerEvents_mhbridge_ch_set(_topic, _msg) {
        const sourceName = _msg.arg[0];
        const chNum = _msg.value[0].arg[0];
        const value = _msg.value[0].value[0];

        if (this.#_ListenChannels) {
            this._SwState.get(sourceName)[chNum] = value;
            this.#_Events.emit(`${sourceName}.${chNum}.value`, value);
        }
    }

    EmitEvents_proxymhbridge_res({ hash, arg, value }) {
        const msg = {
            // hash,
            dest: PROXY_NAME,
            com: `${PROXY_NAME}-res`,
            arg,
            value,
        };
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    async Forward(_sourceName, opts) {
        let { step = undefined } = opts;

        switch (step) {
            case 1: // отключаем ключи в верхнем плече
                await this.Switch(_sourceName, 0, KEY_OFF);
                await this.Switch(_sourceName, 1, KEY_OFF);
                break;

            case 2: // включаем рабочую диагональ
                await this.Switch(_sourceName, 0, KEY_ON);
                await this.Switch(_sourceName, 3, KEY_ON);
                break;

            default:
                throw new Error('Invalid step');
        }
    }

    async Reverse(_sourceName, { step }) {
        switch (step) {
            case 1:
                await this.Switch(_sourceName, 2, KEY_OFF);
                await this.Switch(_sourceName, 3, KEY_OFF);
                break;

            case 2:
                await this.Switch(_sourceName, 2, KEY_ON);
                await this.Switch(_sourceName, 1, KEY_ON);
                break;

            default:
                throw new Error('Invalid step');
        }
    }

    async Stop(_sourceName, opts) {
        let { step = undefined } = opts;

        switch (step) {
            case undefined: {
                await this.Switch(_sourceName, 0, KEY_OFF);
                await this.Switch(_sourceName, 1, KEY_OFF);
                await this.Switch(_sourceName, 2, KEY_OFF);
                await this.Switch(_sourceName, 3, KEY_OFF);
            }

            case 1:
                await this.Switch(_sourceName, 0, KEY_OFF);
                await this.Switch(_sourceName, 1, KEY_OFF);
                break;

            case 2:
                await this.Switch(_sourceName, 2, KEY_OFF);
                await this.Switch(_sourceName, 3, KEY_OFF);
                break;

            default:
                throw new Error('Invalid step');
        }
    }

    /**
     * @param {string} sourceName 
     * @param {number} chNum 
     * @param {number} value 
     */
    async Switch(sourceName, chNum, value) {
        const msg = {
            com: `${PROXY_NAME}-cmd`,
            dest: PROXY_NAME,
            arg: [sourceName],
            value: [{
                arg: [chNum],
                value: [value],
            }]
        }
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
        
        if (this._SwState.get(sourceName)[chNum] === value) return;

        await this.#_Events.waitFor(`${sourceName}.${chNum}.value`, {
            timeout: CH_RES_MAX_TIME,
            filter: (v) => v === value
        });
    }
}

module.exports = ClassModBusHBridge_S;