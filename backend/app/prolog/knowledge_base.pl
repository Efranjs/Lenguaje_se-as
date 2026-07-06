% =====================================================================
% SignAI - Base de Conocimientos Organizacionales
% Municipalidad Provincial de Chincha
%
% Agente de razonamiento que interpreta las senas detectadas por el
% modelo LSTM y deriva al ciudadano al area correcta.
% =====================================================================

% --- BASE DE HECHOS DINAMICA ---
% Estos hechos se insertan desde Python cuando el modelo LSTM
% detecta una sena con alta confianza.
% Ejemplo: assertz(sena_detectada(dni)).

% --- LIMPIEZA DE HECHOS TEMPORALES ---
limpiar_sesion :-
    retractall(sena_detectada(_)).

% --- BASE DE REGLAS ORGANIZACIONALES ---

% Regla 1: Derivacion a Caja / Pagos
orientacion_ciudadano(modulo_caja, 'Por favor, dirijase a la caja para realizar su pago.') :-
    sena_detectada(pagar),
    (sena_detectada(tramite) ; sena_detectada(documento)).

% Regla 2: Asistencia en Registro Civil / RENIEC
orientacion_ciudadano(registro_civil, 'Para tramites de DNI, requiere su documento original y firma.') :-
    sena_detectada(dni),
    (sena_detectada(firma) ; sena_detectada(tramite)).

% Regla 3: Solicitud de informacion general
orientacion_ciudadano(meson_partes, 'Dirijase a la mesa de partes para iniciar su solicitud.') :-
    (sena_detectada(ayuda) ; sena_detectada(donde_esta)),
    sena_detectada(tramite).

% Regla 4: Consulta de costos / tasas
orientacion_ciudadano(tasas_tributarias, 'Consulte las tasas vigentes en la oficina de tributacion municipal.') :-
    sena_detectada(cuanto_cuesta),
    (sena_detectada(tramite) ; sena_detectada(dni) ; sena_detectada(documento)).

% Regla 5: Necesidad de asistencia
orientacion_ciudadano(atencion_inclusiva, 'Un personal de atencion inclusiva le asistira en breve.') :-
    (sena_detectada(necesito_ayuda) ; sena_detectada(no_entiendo)).

% Regla 6: Saludo inicial
orientacion_ciudadano(saludo_inicial, 'Bienvenido. Por favor indique que tramite desea realizar.') :-
    (sena_detectada(hola) ; sena_detectada(buenos_dias) ; sena_detectada(buenas_tardes) ; sena_detectada(buenas_noches)).

% Regla 7: Despedida / cierre
orientacion_ciudadano(cierre_atencion, 'Gracias por su visita. Que tenga un buen dia.') :-
    (sena_detectada(adios) ; sena_detectada(gracias)).

% Regla 8: Ubicacion de areas (sin tramite especifico)
orientacion_ciudadano(orientacion_general, 'Las areas de atencion estan senalizadas en el hall principal.') :-
    sena_detectada(donde_esta),
    \+ sena_detectada(tramite),
    \+ sena_detectada(dni),
    \+ sena_detectada(pagar).

% --- REGLA DE FALLBACK ---
% Si hay senas detectadas pero ninguna regla especifica aplica.
orientacion_ciudadano(atencion_general, 'Por favor acerquese a la mesa de partes para ser atendido.') :-
    sena_detectada(_),
    \+ orientacion_ciudadano(_, _),
    \+ orientacion_ciudadano(atencion_general, _).

% --- CONSULTA PRINCIPAL ---
consultar_orientacion(Area, Mensaje) :-
    orientacion_ciudadano(Area, Mensaje).
