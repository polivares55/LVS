window.addEventListener('DOMContentLoaded', () => {

    // --- 1. REFERENCIAS DEL DOM (Actualizadas) ---
    const dom = {
        f_expr: document.getElementById('f_expr'),
        x_min: document.getElementById('x_min'),
        x_max: document.getElementById('x_max'),
        isDiscrete: document.getElementById('signal_type_toggle'),
        x0_slider: document.getElementById('x0_slider'),
        x0_val: document.getElementById('x0_val'),
        a_slider: document.getElementById('a_slider'),
        a_val: document.getElementById('a_val'),
        plotDiv: document.getElementById('plot'),
        errorMessage: document.getElementById('error_message'),
        discreteScaleInfo: document.getElementById('discrete_scale_info'),
        
        // --- Nuevos botones de Simetría ---
        calc_symmetry_btn: document.getElementById('calc_symmetry_btn'),
        plot_even_btn: document.getElementById('plot_even_btn'),
        plot_odd_btn: document.getElementById('plot_odd_btn'),
        plot_sum_btn: document.getElementById('plot_sum_btn'),
        plot_diff_btn: document.getElementById('plot_diff_btn'),
        reset_plot_btn: document.getElementById('reset_plot_btn')
    };

    // Parser de math.js
    const parser = math.parser();
    
    // --- Almacén para los datos de simetría ---
    let symmetryData = null;

    // --- 2. INICIALIZACIÓN DE PLOTLY ---
    function initializePlot() {
        Plotly.newPlot(dom.plotDiv, [{
            x: [],
            y: [],
            mode: 'lines',
            name: 'y(x)'
        }], {
            title: 'y(x) = f(x)',
            xaxis: { title: 'x' },
            yaxis: { title: 'Amplitud' },
            margin: { l: 50, r: 30, b: 50, t: 50 }
        });
    }

    // --- 3. LÓGICA CENTRAL DE EVALUACIÓN ---

    /**
     * Compila y evalúa una expresión matemática en un rango de puntos.
     */
    function evaluateExpression(expr, x_values) {
        let compiledExpr;
        try {
            compiledExpr = math.compile(expr);
            dom.errorMessage.style.display = 'none';
        } catch (e) {
            dom.errorMessage.textContent = `Error en la expresión: ${e.message}`;
            dom.errorMessage.style.display = 'block';
            return null;
        }

        return x_values.map(x => {
            try {
                const result = compiledExpr.evaluate({ x });
                if (typeof result === 'boolean') {
                    return result ? 1 : 0;
                }
                if (!isFinite(result)) {
                    return 0;
                }
                return result;
            } catch (e) {
                return 0; 
            }
        });
    }

    /**
     * Genera un array de puntos en el eje X (continuo o discreto)
     */
    function getXValues(min, max, isDiscrete) {
        if (isDiscrete) {
            min = Math.floor(min);
            max = Math.ceil(max);
            let n_values = [];
            for (let n = min; n <= max; n++) {
                n_values.push(n);
            }
            return n_values;
        } else {
            const num_points = 1000;
            const step = (max - min) / num_points;
            let x_values = [];
            for (let i = 0; i <= num_points; i++) {
                x_values.push(min + i * step);
            }
            return x_values;
        }
    }
    
    /**
     * Dibuja los "stems" (tallos) para el gráfico discreto
     */
    function createStems(x, y) {
        return x.map((x_val, i) => ({
            type: 'line',
            x0: x_val,
            y0: 0,
            x1: x_val,
            y1: y[i],
            line: {
                color: 'grey',
                width: 1
            }
        }));
    }

    /**
     * Habilita o deshabilita los botones de ploteo de simetría
     */
    function enableSymmetryButtons(enabled) {
        dom.plot_even_btn.disabled = !enabled;
        dom.plot_odd_btn.disabled = !enabled;
        dom.plot_sum_btn.disabled = !enabled;
        dom.plot_diff_btn.disabled = !enabled;
    }

    /**
     * Invalida los datos de simetría si la señal base cambia
     */
    function invalidateSymmetry() {
        symmetryData = null;
        enableSymmetryButtons(false);
    }

    // --- 4. LÓGICA DE OPERACIONES (EL NÚCLEO) ---

    /**
     * Función principal que actualiza el gráfico (Actualizada)
     */
    function updatePlot() {
        // Cualquier cambio en la señal base invalida los cálculos de simetría
        invalidateSymmetry();

        const f_expr = dom.f_expr.value;
        const min = parseFloat(dom.x_min.value);
        const max = parseFloat(dom.x_max.value);
        const isDiscrete = dom.isDiscrete.checked;
        const x0 = parseFloat(dom.x0_slider.value);
        let a = parseFloat(dom.a_slider.value);

        // Actualizar etiquetas de sliders
        dom.x0_val.textContent = x0.toFixed(1);
        dom.a_val.textContent = a.toFixed(2);
        
        // --- Lógica de Escalado Discreto (Intacta) ---
        if (isDiscrete) {
            a = snapDiscreteScale(a);
            dom.a_val.textContent = a.toFixed(2);
            dom.a_slider.value = a; 
        }

        // Generar los puntos del eje X
        let x_values = getXValues(min, max, isDiscrete);

        // Calcular los puntos de la función transformada: f(a * (x - x0))
        let transformed_x = x_values.map(x => a * (x - x0));
        
        let y_values = evaluateExpression(f_expr, transformed_x);
        
        if (!y_values) return; // Error de sintaxis, no continuar

        // --- Lógica Específica de Diezmado/Interpolación (Intacta) ---
        if (isDiscrete && a !== 1) {
            const base_n = getXValues(min, max, true);
            const base_f_n = evaluateExpression(f_expr, base_n);
            
            if (a > 1) { // Compresión (Diezmado)
                const factor = Math.round(a);
                y_values = base_f_n.filter((_, i) => base_n[i] % factor === 0);
                x_values = base_n.filter((_, i) => base_n[i] % factor === 0).map(n => n / factor);
                
            } else if (a < 1) { // Expansión (Interpolación por ceros)
                const factor = Math.round(1 / a);
                y_values = [];
                x_values = [];
                let n_original = 0;
                for (let n = min; n <= max; n++) {
                    x_values.push(n);
                    if (n % factor === 0) {
                        const original_index = base_n.indexOf(n_original);
                        if (original_index !== -1) {
                            y_values.push(base_f_n[original_index]);
                        } else {
                            y_values.push(0);
                        }
                        n_original++;
                    } else {
                        y_values.push(0); // Insertar cero
                    }
                }
            }
        }
        
        // --- Actualización de Plotly ---
        const trace = {
            x: x_values,
            y: y_values,
            mode: isDiscrete ? 'markers' : 'lines',
            type: 'scatter',
            name: 'y(x)',
            marker: isDiscrete ? { size: 8, color: '#007bff' } : {},
            line: { color: '#007bff' }
        };

        const title = `y(${isDiscrete ? 'n' : 't'}) = f(${a.toFixed(2)} * (${isDiscrete ? 'n' : 't'} - ${x0.toFixed(1)}))`;
        
        const layout = {
            title: title,
            xaxis: { title: isDiscrete ? 'n' : 't', range: [min, max] },
            yaxis: { title: 'Amplitud' },
            shapes: isDiscrete ? createStems(x_values, y_values) : []
        };

        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * Ajusta el slider 'a' a valores didácticos (enteros o inversos)
     */
    function snapDiscreteScale(a) {
        const supported_scales = [0.2, 0.25, 0.33, 0.5, 1, 2, 3];
        return supported_scales.reduce((prev, curr) => 
            (Math.abs(curr - a) < Math.abs(prev - a) ? curr : prev)
        );
    }

    // --- 5. LÓGICAS DE BOTONES (Refactorizadas) ---

    /**
     * 5.1. Calcula y almacena las componentes de simetría
     */
    function calculateSymmetry() {
        const f_expr = dom.f_expr.value;
        const min = parseFloat(dom.x_min.value);
        const max = parseFloat(dom.x_max.value);
        const isDiscrete = dom.isDiscrete.checked;
        const x_values = getXValues(min, max, isDiscrete);
        
        const f_x = evaluateExpression(f_expr, x_values);
        const x_neg = x_values.map(x => -x);
        const f_neg_x = evaluateExpression(f_expr, x_neg);

        if (!f_x || !f_neg_x) {
            dom.errorMessage.textContent = "Error al evaluar f(x) o f(-x). Revise la expresión.";
            dom.errorMessage.style.display = 'block';
            return;
        }

        const f_e = f_x.map((val, i) => 0.5 * (val + f_neg_x[i]));
        const f_o = f_x.map((val, i) => 0.5 * (val - f_neg_x[i]));

        // Almacena los resultados
        symmetryData = {
            x: x_values,
            f: f_x,
            fe: f_e,
            fo: f_o,
            isDiscrete: isDiscrete,
            range: [min, max],
            x_label: isDiscrete ? 'n' : 't'
        };

        // Habilita los botones de ploteo
        enableSymmetryButtons(true);
        dom.errorMessage.textContent = "Componentes calculadas. Listo para graficar.";
        dom.errorMessage.style.display = 'block';
        setTimeout(() => { dom.errorMessage.style.display = 'none'; }, 2000);
    }

    /**
     * 5.2. Plotea solo la componente Par
     */
    function plotEven() {
        if (!symmetryData) return;
        
        const trace = {
            x: symmetryData.x,
            y: symmetryData.fe,
            mode: symmetryData.isDiscrete ? 'markers' : 'lines',
            type: 'scatter',
            name: 'f_e(x)',
            line: { color: 'red' }
        };

        const layout = {
            title: 'Componente Par (f_e)',
            xaxis: { title: symmetryData.x_label, range: symmetryData.range },
            yaxis: { title: 'Amplitud' },
            shapes: symmetryData.isDiscrete ? createStems(symmetryData.x, symmetryData.fe) : []
        };
        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * 5.3. Plotea solo la componente Impar
     */
    function plotOdd() {
        if (!symmetryData) return;
        
        const trace = {
            x: symmetryData.x,
            y: symmetryData.fo,
            mode: symmetryData.isDiscrete ? 'markers' : 'lines',
            type: 'scatter',
            name: 'f_o(x)',
            line: { color: 'blue' }
        };

        const layout = {
            title: 'Componente Impar (f_o)',
            xaxis: { title: symmetryData.x_label, range: symmetryData.range },
            yaxis: { title: 'Amplitud' },
            shapes: symmetryData.isDiscrete ? createStems(symmetryData.x, symmetryData.fo) : []
        };
        Plotly.react(dom.plotDiv, [trace], layout);
    }

    /**
     * 5.4. Plotea la Suma (Verificación)
     */
    function plotSum() {
        if (!symmetryData) return;

        const f_sum = symmetryData.fe.map((val, i) => val + symmetryData.fo[i]);

        const trace_orig = {
            x: symmetryData.x, y: symmetryData.f, 
            mode: 'lines', name: 'Original f(x)', 
            line: { dash: 'dot', color: 'grey', width: 4 }
        };
        
        const trace_sum = {
            x: symmetryData.x, y: f_sum, 
            mode: 'lines', name: 'Suma (f_e + f_o)', 
            line: { color: 'red', width: 2 }
        };
        
        if(symmetryData.isDiscrete) {
            [trace_orig, trace_sum].forEach(t => {
                t.mode = 'markers';
                t.line = {};
                t.marker = { size: t.name === 'Original f(x)' ? 10 : 6 };
            });
            trace_orig.marker.symbol = 'circle-open';
            trace_sum.marker.color = 'red';
            trace_orig.marker.color = 'grey';
        }

        const layout = {
            title: 'Verificación de Suma: f(x) vs (f_e + f_o)',
            xaxis: { title: symmetryData.x_label, range: symmetryData.range },
            yaxis: { title: 'Amplitud' },
            shapes: []
        };
        Plotly.react(dom.plotDiv, [trace_orig, trace_sum], layout);
    }
    
    /**
     * 5.5. Plotea la Resta (Contraste)
     */
    function plotDifference() {
        if (!symmetryData) return;

        const f_diff = symmetryData.fe.map((val, i) => val - symmetryData.fo[i]);

        const trace_orig = {
            x: symmetryData.x, y: symmetryData.f, 
            mode: 'lines', name: 'Original f(x)', 
            line: { dash: 'dot', color: 'grey', width: 4 }
        };
        
        const trace_diff = {
            x: symmetryData.x, y: f_diff, 
            mode: 'lines', name: 'Resta (f_e - f_o)', 
            line: { color: 'orange', width: 2 }
        };
        
        if(symmetryData.isDiscrete) {
             [trace_orig, trace_diff].forEach(t => {
                t.mode = 'markers';
                t.line = {}; 
                t.marker = { size: t.name === 'Original f(x)' ? 10 : 6 };
            });
            trace_orig.marker.symbol = 'circle-open';
            trace_diff.marker.color = 'orange';
            trace_orig.marker.color = 'grey';
        }

        const layout = {
            title: 'Contraste: f(x) vs (f_e - f_o)',
            xaxis: { title: symmetryData.x_label, range: symmetryData.range },
            yaxis: { title: 'Amplitud' },
            shapes: []
        };
        Plotly.react(dom.plotDiv, [trace_orig, trace_diff], layout);
    }

    // --- ¡¡FUNCIÓN RESTAURADA!! ---
    /**
     * Gestiona la visibilidad de los controles
     */
    function toggleControls() {
        const isDiscrete = dom.isDiscrete.checked;
        dom.discreteScaleInfo.style.display = isDiscrete ? 'block' : 'none';
        updatePlot(); // Actualizar gráfico al cambiar de modo
    }
    // --- FIN DE LA RESTAURACIÓN ---


    // --- 6. ASIGNACIÓN DE EVENTOS (LISTENERS) ---
    
    // Sliders y inputs
    dom.x0_slider.addEventListener('input', updatePlot);
    dom.a_slider.addEventListener('input', updatePlot);
    dom.f_expr.addEventListener('change', updatePlot);
    dom.x_min.addEventListener('change', updatePlot);
    dom.x_max.addEventListener('change', updatePlot);
    dom.isDiscrete.addEventListener('change', toggleControls);
    
    // Botones de Simetría (Nuevos)
    dom.calc_symmetry_btn.addEventListener('click', calculateSymmetry);
    dom.plot_even_btn.addEventListener('click', plotEven);
    dom.plot_odd_btn.addEventListener('click', plotOdd);
    dom.plot_sum_btn.addEventListener('click', plotSum);
    dom.plot_diff_btn.addEventListener('click', plotDifference);
    dom.reset_plot_btn.addEventListener('click', updatePlot); // 'Reset' simplemente vuelve a f(x)
    
    
    // --- 7. INICIO DE LA APP ---
    
    initializePlot();
    toggleControls(); // Esta llamada ahora funcionará
});
