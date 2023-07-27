interface AdvancedStep extends introJs.Step {
    // Indicates whether the next button should be hidden for this step.
    hideNext: boolean;
    
    // Indicates whether the prev button should be hidden for this step.
    hidePrev: boolean;

    // The hints to show for this step.
    hints?: introJs.Hint[];

    // Defines a condition.
    condition?: string;
}

interface AdvancedOptions extends Omit<introJs.Options, 'steps'> {
    // The steps with additional configuration.
    steps: AdvancedStep[];
}

function advanceTour(options: AdvancedOptions) {
    const intro = window['introJs']();

    let listeners: ((() => void) | undefined)[] = [];

    function clearAll() {
        for (const listener of listeners) {
            if (listener) {
                listener();
            }
        }
        
        listeners = [];
    }

    const privateIntro: { _currentStep: number } = intro as any;

    intro
        .onexit(async () => {
            clearAll();
        })
        .onafterchange(async () => {
            clearAll();

            const stepIndex = privateIntro._currentStep
            const stepConfig = options.steps[stepIndex];

            // The element has been resolved by intro.js at this point.
            const element = resolveElement(stepConfig.element)!;

            // Hint elements cannot be strings, therefore we fix that here.
            if (stepConfig.hints) {
                for (const hint of stepConfig.hints) {
                    if (typeof hint.element === 'string') {
                        hint.element = element.querySelector(hint.element)!;
                    }
                }
            }

            const hidePrev = !!stepConfig.hidePrev;
            const hideNext = !!stepConfig.hideNext;

            // Intro js has no solid method to hide the buttons, therefore we use the display style.
            hideElement('.introjs-prevbutton', hidePrev);
            hideElement('.introjs-nextbutton', hideNext);
            hideElement('.introjs-tooltipbuttons', hidePrev && hideNext);

            // Monitor the element and exit the tour the element is not visible anymore.
            listeners.push(monitorElement(element, () => {
                intro.exit();
            }));

            // Do not use promises here, because we cannot really cancel them.
            listeners.push(subscribeToConditions(options.steps[stepIndex + 1], () => {
                intro.nextStep();
            }));
        })
        .setOptions(options)
        .start();
}

const ConditionText = /^(?<selector>[^:]*):has-text(\((?<wait>[0-9]+)\))?/;
const ConditionVisible = /^(?<selector>[^:]*):visible?/;

function subscribeToConditions(nextStep: AdvancedStep, callback: () => void) {
    if (!nextStep?.condition) {
        return;
    }

    const hasText = ConditionText.exec(nextStep.condition);

    // For example input:has-text(2000)
    if (hasText?.groups) {
        return waitForText(hasText.groups.selector, parseInt(hasText.groups.wait, 10), callback);
    }

    const visible = ConditionVisible.exec(nextStep.condition);

    // For example modal:visible.
    if (visible?.groups) {
        return waitForElement(visible.groups.selector, 0, callback);
    }
}

const transitionEvent: string = (() => {
    const element = document.createElement('fake');

    const transitions: Record<string, string> = {
        'transition'      : 'transitionend',
        'OTransition'     : 'oTransitionEnd',
        'MozTransition'   : 'transitionend',
        'WebkitTransition': 'webkitTransitionEnd'
    }

    let transitionName = 'transition';

    for (const eventName of Object.keys(transitions)){
        if (element.style[eventName as any] !== undefined) {
            element.remove();
            transitionName = transitions[eventName];
        }
    }

    element.remove();
    return transitionName;
})();

function waitForText(selector: string | HTMLInputElement, delay: number, callback: () => void) {
    const element = resolveElement<HTMLInputElement>(selector);

    if (!element || element.value) {
        callback();
        return;
    }

    function cleanup() {
        clearTimeout(currentTimer);
        document.removeEventListener('input', currentListener!);
    }

    let currentTimer: any = null;
    let currentListener = () => {
        clearTimeout(currentTimer);

        // Whenever the user enters some text, we wait a second until no input has been added anymore to show the next step.
        if (element.value) {
            currentTimer = setTimeout(() => {
                cleanup();
                callback();
            }, delay || 1000);
        }
    }

    element.addEventListener('input', currentListener);
    
    return () => {
        cleanup();
    };
}

function waitForElement(selector: string | HTMLElement, delay: number, callback: () => void) {
    const resolved = resolveElement(selector);

    const handleElement = (resolved: HTMLElement) => {
        const complete = () => {
            if (delay) {
                setTimeout(callback, delay);
            } else {
                callback();
            }
        };

        if (isAnimating(resolved)) {
            let listener: () => void;

            listener = () => {
                resolved!.removeEventListener(transitionEvent, listener);
                complete();
            };

            resolved.addEventListener(transitionEvent, listener);
        } else {
            complete();
        }

        return;

    };

    if (resolved && isVisible(resolved)) {
        handleElement(resolved);
        return;
    }

    function cleanup() {
        clearInterval(currentTimer);
    }

    let currentTimer = setInterval(() => {
        const resolved = resolveElement(selector);

        if (resolved && isVisible(resolved)) {
            handleElement(resolved);
        }
    }, 200);
    
    return () => {
        cleanup();
    };
}

function monitorElement(selector: string | HTMLElement, callback: () => void) {
    const element = resolveElement(selector);

    if (!element) {
        return;
    }

    let timer = setInterval(() => {
        if (!element.parentNode || !isVisible(element)) {
            callback();
            clearTimeout(timer);
        }
    }, 200);

    return () => {
        clearTimeout(timer);
    };
}

function isVisible(element: HTMLElement) {
    return !!(element.offsetWidth || element.offsetHeight || element.getClientRects().length);
}

function isAnimating(element: HTMLElement) {
    const style = window.getComputedStyle(element);
    
    return style.animationName !== 'none' || !!style.transition;
}

function hideElement(selector: string | HTMLElement, hidden: boolean) {    
    resolveElement(selector)!.style.display = hidden ? 'none' : 'block'
}

function resolveElement<T extends HTMLElement>(selector: string | T | Element | undefined): T | undefined {
    if (typeof selector === 'string') {
        return document.querySelector(selector) as T;
    } else {
        return selector as T;
    }
}

(window as any)['advanceTour'] = advanceTour;