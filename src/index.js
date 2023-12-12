/**
 * Example showcasing sweeping ECG line charts.
 *
 * Sweeping line chart functionality is not built-in into the library.
 * However, it is very well possible to build performant and good looking sweeping line applications
 * with LightningChart JS. Performance is not affected, but application code is slightly more complicated than
 * scrolling axis and some built-in features like real-time axis ticks and glow effects are not applicable.
 */

const lcjs = require('@arction/lcjs')

const { lightningChart, emptyLine, AutoCursorModes, AxisTickStrategies, ColorHEX, SolidFill, PointShape } = lcjs

let contentRest = 0;
let startCurves = false;
let startContent = [];


const channelCount = 5
const dataRateHz = 254
// const dataRateHz = 254
const xViewMs = 10 * 1000

function wsConnect(dataArray) {
    const socket = new WebSocket('ws://54.207.148.13:8002/');
    socket.onopen = function (event) {
        console.log('Conectado');
    };

    socket.onmessage = function (event) {
        const json = JSON.parse(event.data.toString());
        if (json.equipment !== 3) return;
        if (startCurves) console.log('Conteúdo restante', dataArray.length, contentRest);
        if (!startContent.length) console.clear();

        const content = json.waves.plenth; // as number[]
        // console.log('Conteúdo recebido', content.length);

        if (!startCurves) {
            startContent.push(...content);
            console.log('Acumulando...');
            if (startContent.length >= 2000) {
                startCurves = true;
                console.log('Iniciando curvas');
                dataArray.push(...startContent);
            }
            return;
        }
        dataArray.push(...content);
    }
}

fetch(document.head.baseURI + 'examples/assets/0033/ecg.json')
    .then((r) => r.json())
    .then((ecgData) => {
        console.log(ecgData);
        const CHANNELS = new Array(channelCount).fill(0).map((_, i) => ({ name: `ECG-${i + 1}`, yMin: 0, yMax: 250 }))
        wsConnect(ecgData);
        // NOTE: Using `Dashboard` is no longer recommended for new applications. Find latest recommendations here: https://lightningchart.com/js-charts/docs/basic-topics/grouping-charts/
        const dashboard = lightningChart({
            // Valid until 12/31/2023
            license: "0002-n7PjjV4UiPOo2WHXhl9PY1lvTawGKwCy47RKA4TsvM5tyF7nl2aw+2XZbIHsLEAZpiUjY6TYIcT3ZqENMhE4c9Wo-MEUCIGLwiuc9OPKJn9pdC1Dqx0YhMMnlZ37D8d9csx47WTAOAiEA81C2R7qsUlpjhuY0CjB2r+DTykiifOGQ8FdEUYbrDHw=",
            licenseInformation: {
                appTitle: "LightningChart JS Trial",
                company: "LightningChart Ltd."
            },
        })
            .Dashboard({
                numberOfColumns: 1,
                numberOfRows: CHANNELS.length,
                // theme: Themes.darkGold
            })
            .setSplitterStyle(emptyLine)
        const theme = dashboard.getTheme()
        const ecgBackgroundFill = new SolidFill({
            color: theme.isDark ? ColorHEX('#000000') : ColorHEX('#ffffff'),
        })

        const channels = CHANNELS.map((info, iCh) => {
            const chart = dashboard
                .createChartXY({
                    columnIndex: 0,
                    rowIndex: iCh,
                })
                .setTitle(info.name)
                .setTitlePosition('series-left-top')
                .setAutoCursorMode(AutoCursorModes.disabled)
                .setSeriesBackgroundFillStyle(ecgBackgroundFill)
                .setMouseInteractions(false)
                .setSeriesBackgroundStrokeStyle(emptyLine)

            const axisX = chart
                .getDefaultAxisX()
                .setTickStrategy(AxisTickStrategies.Empty)
                .setStrokeStyle(emptyLine)
                .setScrollStrategy(undefined)
                .setInterval({ start: 0, end: xViewMs, stopAxisAfter: false })

            const axisY = chart
                .getDefaultAxisY()
                .setStrokeStyle(emptyLine)
                .setInterval({ start: info.yMin, end: info.yMax })
                .setTickStrategy(AxisTickStrategies.Empty)

            // Series for displaying "old" data.
            const seriesRight = chart
                .addLineSeries({
                    dataPattern: { pattern: 'ProgressiveX' },
                    automaticColorIndex: iCh,
                })
                .setName(info.name)
                .setStrokeStyle((stroke) => stroke.setThickness(2))
                .setEffect(false)

            // Rectangle for hiding "old" data under incoming "new" data.
            const seriesOverlayRight = chart.addRectangleSeries().setEffect(false)
            const figureOverlayRight = seriesOverlayRight
                .add({ x1: 0, y1: 0, x2: 0, y2: 0 })
                .setFillStyle(ecgBackgroundFill)
                .setStrokeStyle(emptyLine)
                .setMouseInteractions(false)

            // Series for displaying new data.
            const seriesLeft = chart
                .addLineSeries({
                    dataPattern: { pattern: 'ProgressiveX' },
                    automaticColorIndex: iCh,
                })
                .setName(info.name)
                .setStrokeStyle((stroke) => stroke.setThickness(2))
                .setEffect(false)

            const seriesHighlightLastPoints = chart
                .addPointSeries({ pointShape: PointShape.Circle })
                .setPointFillStyle(new SolidFill({ color: theme.examples.highlightPointColor }))
                .setPointSize(5)
                .setEffect(false)

            // Synchronize highlighting of "left" and "right" series.
            let isHighlightChanging = false;
            [seriesLeft, seriesRight].forEach((series) => {
                series.onHighlight((value) => {
                    if (isHighlightChanging) {
                        return
                    }
                    isHighlightChanging = true
                    seriesLeft.setHighlight(value)
                    seriesRight.setHighlight(value)
                    isHighlightChanging = false
                })
            })

            return {
                chart,
                seriesLeft,
                seriesRight,
                seriesOverlayRight,
                figureOverlayRight,
                seriesHighlightLastPoints,
                axisX,
                axisY,
            }
        })

        // Setup logic for pushing new data points into a "custom sweeping line chart".
        // LightningChart JS does not provide built-in functionalities for sweeping line charts.
        // This example shows how it is possible to implement a performant sweeping line chart, with a little bit of extra application complexity.
        let prevPosX = 0
        // Keep track of data pushed to each channel.
        const handleIncomingData = (dataPointsAllChannels) => {
            // Keep track of the latest X (time position), clamped to the sweeping axis range.
            let posX = 0

            for (let iCh = 0; iCh < CHANNELS.length; iCh += 1) {
                const newDataPointsTimestamped = dataPointsAllChannels[iCh]
                const channel = channels[iCh]

                // NOTE: Incoming data points are timestamped, meaning their X coordinates can go outside sweeping axis interval.
                // Clamp timestamps onto the sweeping axis range.
                const newDataPointsSweeping = newDataPointsTimestamped.map((dp) => ({
                    x: dp.x % xViewMs,
                    y: dp.y,
                }))
                const newDataPointsCount = newDataPointsSweeping.length

                posX = Math.max(posX, newDataPointsSweeping[newDataPointsSweeping.length - 1].x)

                // Check if the channel completes a full sweep (or even more than 1 sweep even though it can't be displayed).
                let fullSweepsCount = 0
                let signPrev = false
                for (const dp of newDataPointsSweeping) {
                    const sign = dp.x < prevPosX
                    if (sign === true && sign !== signPrev) {
                        fullSweepsCount += 1
                    }
                    signPrev = sign
                }

                if (fullSweepsCount > 1) {
                    // The below algorithm is incapable of handling data input that spans over several full sweeps worth of data.
                    // To prevent visual errors, reset sweeping graph and do not process the data.
                    // This scenario is triggered when switching tabs or minimizing the example for extended periods of time.
                    channel.seriesRight.clear()
                    channel.seriesLeft.clear()
                } else if (fullSweepsCount === 1) {
                    // Sweeping cycle is completed.
                    // Categorize new data points into those belonging to current sweep and the next.
                    let dataCurrentSweep = []
                    let dataNextSweep = []
                    for (let i = 0; i < newDataPointsCount; i += 1) {
                        if (newDataPointsSweeping[i].x <= prevPosX) {
                            dataCurrentSweep = newDataPointsSweeping.slice(0, i)
                            dataNextSweep = newDataPointsSweeping.slice(i + 1)
                            break
                        }
                    }
                    // Finish current sweep.
                    channel.seriesLeft.add(dataCurrentSweep)
                    // Swap left and right series.
                    const nextLeft = channel.seriesRight
                    const nextRight = channel.seriesLeft
                    channel.seriesLeft = nextLeft
                    channel.seriesRight = nextRight
                    channel.seriesRight.setDrawOrder({ seriesDrawOrderIndex: 0 })
                    channel.seriesOverlayRight.setDrawOrder({ seriesDrawOrderIndex: 1 })
                    channel.seriesLeft.setDrawOrder({ seriesDrawOrderIndex: 2 })
                    // Start sweeping from left again.
                    channel.seriesLeft.clear()
                    channel.seriesLeft.add(dataNextSweep)
                } else {
                    // Append data to left.
                    channel.seriesLeft.add(newDataPointsSweeping)
                }

                // Highlight last data point.
                const highlightPoints = [newDataPointsSweeping[newDataPointsSweeping.length - 1]]
                channel.seriesHighlightLastPoints.clear().add(highlightPoints)
            }

            // Move overlays of old data to right locations.
            const overlayXStart = 0
            const overlayXEnd = posX + xViewMs * 0.03
            channels.forEach((channel) => {
                channel.figureOverlayRight.setDimensions({
                    x1: overlayXStart,
                    x2: overlayXEnd,
                    y1: channel.axisY.getInterval().start,
                    y2: channel.axisY.getInterval().end,
                })
            })

            prevPosX = posX
        }

        // Setup example data streaming
        let tStart = window.performance.now()
        let pushedDataCount = 0
        const xStep = 1000 / dataRateHz
        const streamData = () => {
            const tNow = window.performance.now()
            // NOTE: This code is for example purposes only (streaming stable data rate)
            // In real use cases, data should be pushed in when it comes.
            const shouldBeDataPointsCount = Math.floor((dataRateHz * (tNow - tStart)) / 1000)
            const newDataPointsCount = shouldBeDataPointsCount - pushedDataCount
            if (newDataPointsCount > 0) {
                const newDataPoints = []
                for (let iDp = 0; iDp < newDataPointsCount; iDp++) {
                    const x = (pushedDataCount + iDp) * xStep
                    const iData = (pushedDataCount + iDp) % ecgData.length
                    contentRest = iData;
                    const y = ecgData[iData];
                    // console.log(y);
                    const point = { x, y }
                    newDataPoints.push(point)
                }

                // For this examples purposes, stream same data into all channels.
                handleIncomingData(new Array(CHANNELS.length).fill(0).map((_) => newDataPoints))
                pushedDataCount += newDataPointsCount
            }

            requestAnimationFrame(streamData)
        }
        streamData()
    })
