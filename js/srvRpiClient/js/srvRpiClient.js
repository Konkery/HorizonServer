const ClassBaseService_S = require('./../../srvService/js/srvService');

let Gpio;
try {
    Gpio = require('onoff').Gpio;
} catch (e) {
    Gpio = null;
}

const NAME = 'rpiclient';
const PRIMARY_BUS = 'rpiBus';
const PROTOCOL = 'rpi';
const BUS_NAME_LIST = ['sysBus', 'logBus', PRIMARY_BUS];

class ClassRpiClient_S extends ClassBaseService_S {
    #_GpioInstances = new Map();
    #_WatchGpioMap = new Map();
    #_InputValues = new Map();
    #_ListenChannels = false;

    /**
     * @constructor
     * @param {object} params
     * @param {Array} params._busList
     * @param {string} [params._primaryBus]
     * @param {object} [params._node]
     * @param {object} [params._advOpts] - доп. настройки ({ offset: 0 })
     */
    constructor({ _busList, _primaryBus, _node, _advOpts }) {
        const primBus = _primaryBus ?? PRIMARY_BUS;
        super({ _name: NAME, _busNameList: [primBus, ...BUS_NAME_LIST], _busList, _node });
        this.PrimaryBus = primBus;
        this.Offset = 512; //Number(_advOpts?.offset) || 0;

        this.FillEventOnList('sysBus', ['all-init-stage1-set', 'all-close']);
        this.FillEventOnList(this.PrimaryBus, [`${NAME}-ch-set`, `${NAME}-init-ports`]);
    }

    *Sources() {
        for (let source of Object.values(this.SourcesState)) {
            if (source.Protocol === PROTOCOL && !source.IsConnected && source.CheckProcess && source.Status === 'active')
                yield source;
        }
    }

    async HandlerEvents_all_init_stage1_set(_topic, _msg) {
        super.HandlerEvents_all_init_stage1_set(_topic, _msg);

        for (const [key, gpioInfo] of this.#_WatchGpioMap.entries()) {
            const { sourceName, port, gpio } = gpioInfo;
            try {
                const val = await new Promise((resolve) => {
                    gpio.read((err, value) => resolve(err ? undefined : value));
                });
                if (val !== undefined) {
                    this.#_InputValues.set(key, val);
                    this._EmitPortValue(sourceName, port, val);
                }
            } catch (e) {
            }
        }
    }

    async HandlerEvents_rpiclient_init_ports(_topic, _msg) {
        const sourceName = _msg.arg[0];
        const ports = _msg.value[0]?.ports ?? [];

        for (const port of ports) {
            this._SetupWatchPort(sourceName, port);
        }
    }

    /**
     * Валидирует и рассчитывает номер физического GPIO пина.
     * @param {string} sourceName
     * @param {number|string} port
     * @returns {number|null} Итоговый номер пина или null, если порт невалиден
     */
    _ResolveGpioPin(sourceName, port) {
        if (port === undefined || port === null) return null;
        const numPort = Number(port);
        if (isNaN(numPort) || !Number.isInteger(numPort) || numPort < 0) {
            return null;
        }
        const sourceOffset = Number(this.SourcesState?.[sourceName]?.AdvOpts?.offset) || this.Offset;
        const finalPin = numPort + sourceOffset;
        if (isNaN(finalPin) || !Number.isInteger(finalPin) || finalPin < 0) {
            return null;
        }
        return finalPin;
    }

    _SetupWatchPort(sourceName, port) {
        if (!Gpio) return;
        const key = `${sourceName}:${port}`;
        if (this.#_WatchGpioMap.has(key)) return;

        const gpioPin = this._ResolveGpioPin(sourceName, port);
        if (gpioPin === null) {
            this.EmitEvents_logger_log({ msg: `[RpiClient] Invalid GPIO port "${port}" for source ${sourceName}`, level: 'E' });
            return;
        }

        try {
            const gpio = new Gpio(gpioPin, 'in', 'both');
            this.#_WatchGpioMap.set(key, { sourceName, port, gpio });

            gpio.read((err, val) => {
                if (!err && val !== undefined) {
                    this.#_InputValues.set(key, val);
                    this._EmitPortValue(sourceName, port, val);
                }
            });

            gpio.watch((err, val) => {
                if (err || val === undefined) return;
                this.#_InputValues.set(key, val);
                this._EmitPortValue(sourceName, port, val);
            });
        } catch (e) {
            this.EmitEvents_logger_log({ msg: `[RpiClient] Error watching GPIO port ${port} (pin ${gpioPin}): ${e.message}`, level: 'E' });
        }
    }

    _EmitPortValue(sourceName, port, value) {
        const msg = {
            com: 'proxyrpi-ch-get',
            dest: 'proxyrpiclient',
            arg: [sourceName],
            value: [{
                arg: [port],
                value: [value]
            }]
        };
        this.EmitMsg(this.PrimaryBus, msg.com, msg);
    }

    async HandlerEvents_rpiclient_ch_set(_topic, _msg) {
        debugger;
        const sourceName = _msg.arg[0];
        const [port] = _msg.value[0].arg;
        const value = _msg.value[0].value[0];

        await this.WritePin(sourceName, port, value);
    }

    _GetGpio(sourceName, port, direction = 'out') {
        if (!Gpio) return null;

        const key = `${sourceName}:${port}`;
        if (!this.#_GpioInstances.has(key)) {
            const gpioPin = this._ResolveGpioPin(sourceName, port);
            if (gpioPin === null) {
                this.EmitEvents_logger_log({ msg: `[RpiClient] Invalid GPIO port "${port}" for source ${sourceName}`, level: 'E' });
                return null;
            }

            try {
                const gpioInstance = new Gpio(gpioPin, direction);
                this.#_GpioInstances.set(key, gpioInstance);
            } catch (e) {
                this.EmitEvents_logger_log({ msg: `[RpiClient] Error initializing GPIO port ${port} (pin ${gpioPin}): ${e.message}`, level: 'E' });
                return null;
            }
        }
        return this.#_GpioInstances.get(key);
    }

    async WritePin(sourceName, port, value) {
        const gpio = this._GetGpio(sourceName, port, 'out');
        if (!gpio) return;

        return new Promise((resolve, reject) => {
            gpio.write(value ? 1 : 0, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    /**
     * Завершение работы: освобождение всех экспортированных GPIO портов
     */
    HandlerEvents_all_close(_topic, _msg) {
        super.HandlerEvents_all_close?.(_topic, _msg);

        // Отписка от watch портов
        for (const { gpio } of this.#_WatchGpioMap.values()) {
            try {
                gpio.unwatchAll();
                gpio.unexport();
            } catch (e) {}
        }
        this.#_WatchGpioMap.clear();

        // Освобождение выходов
        for (const gpio of this.#_GpioInstances.values()) {
            try {
                gpio.unexport();
            } catch (e) {}
        }
        this.#_GpioInstances.clear();
    }
}

module.exports = ClassRpiClient_S;