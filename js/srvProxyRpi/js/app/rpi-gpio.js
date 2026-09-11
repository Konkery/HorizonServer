/**
 * @file rpi-gpio.js
 * @description Примеры конфигурации источников Raspberry Pi GPIO и управления портами ввода/вывода (Input/Output).
 */

// ============================================================================
// 1. ПРИМЕРЫ КОНФИГУРАЦИИ ИСТОЧНИКОВ RASPBERRY PI В ADVANCEDOPTIONS
// ============================================================================

/**
 * Вариант А: Конфигурация через Массив (Sequential/All channels)
 * Индекс в массиве соответствует номеру порта (0 -> GPIO 0, 1 -> GPIO 1, 2 -> GPIO 2).
 */
const rpiSourceArrayConfig = {
    Name: 'rpi-hub-1',
    Protocol: 'rpi',
    Status: 'active',
    CheckProcess: true,
    AdvOpts: {
        offset: 0, // Необязательное смещение для нумерации пинов
        channels: [
            'ch-gpio-0', // порт 0 -> gpio 0 (или 0 + offset)
            'ch-gpio-1', // порт 1 -> gpio 1
            'ch-gpio-2', // порт 2 -> gpio 2
            'ch-gpio-3'  // порт 3 -> gpio 3
        ]
    }
};

/**
 * Вариант Б: Конфигурация через Объект с разделением на порты ввода (inputs) и вывода (channels)
 */
const rpiSourceObjectConfig = {
    Name: 'rpi-hub-2',
    Protocol: 'rpi',
    Status: 'active',
    CheckProcess: true,
    AdvOpts: {
        offset: 0,
        // Каналы управления/вывода (Outputs) и входа (Inputs)
        channels: {
            4:  'ch-relay-light',   // GPIO 4  -> Выход: управления светом
            17: 'ch-relay-pump',    // GPIO 17 -> Выход: управления насосом
            27: 'ch-button-sensor'  // GPIO 27 -> Вход: кнопка/датчик
        },
        // Явный список портов ввода для отслеживания через watch (если не задан, берутся все порты из channels)
        inputs: [27]
    }
};


// ============================================================================
// 2. УПРАВЛЕНИЕ ВЫХОДНЫМИ КАНАЛАМИ (OUTPUT)
// ============================================================================

/**
 * Изменение состояния выходного канала через топик 'all-data-fine-set' на шине 'dataBus'
 * 
 * Маршрут: dataBus ('all-data-fine-set') -> proxyrpiclient -> rpiBus ('rpiclient-ch-set') -> rpiclient -> onoff.write()
 */
function exampleSetOutputState(bus) {
    const channelName = 'ch-relay-light';
    const newValue = 1; // 1 = High / On, 0 = Low / Off

    const msg = {
        dest: 'proxyrpiclient',
        com: 'all-data-fine-set',
        arg: [channelName],
        value: [
            { Value: newValue }
        ]
    };

    bus.EmitMsg('dataBus', msg.com, msg);
}

/**
 * Прямая установка значения порта на шине 'rpiBus' через 'rpiclient-ch-set'
 */
function exampleSetPortDirectly(bus) {
    const sourceName = 'rpi-hub-2';
    const port = 4; // GPIO 4
    const value = 1;

    const msg = {
        dest: 'rpiclient',
        com: 'rpiclient-ch-set',
        arg: [sourceName],
        value: [{
            arg: [port],
            value: [value]
        }]
    };

    bus.EmitMsg('rpiBus', msg.com, msg);
}


// ============================================================================
// 3. РАБОТА С ВХОДНЫМИ КАНАЛАМИ (INPUT WATCH & INITIAL READ)
// ============================================================================

/**
 * Архитектура входных каналов (Input):
 * 1. На этапе инициализации stage1 proxyrpiclient отправляет команду rpiclient-init-ports с массивом входных портов.
 * 2. rpiclient вешает gpio.watch('both') на указанные порты и производит первичный read().
 * 3. Все обновления (и первичные значения) автоматически отправляются на proxyrpi (топик proxyrpi-ch-get),
 *    который транслирует их каналу через all-actuator-set на dataBus.
 * 4. Ручная команда Read не требуется, так как актуальное значение всегда присутствует в системе.
 */

module.exports = {
    rpiSourceArrayConfig,
    rpiSourceObjectConfig,
    exampleSetOutputState,
    exampleSetPortDirectly
};
