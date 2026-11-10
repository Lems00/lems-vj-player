// Le design system (lems.js) est un script classique qui lit `window.React`.
// Ce module doit être importé avant lui : les modules s'exécutent dans l'ordre d'import.
import * as React from 'react';

(window as unknown as { React: typeof React }).React = React;

export {};
