import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Form, Modal } from "antd";
import dayjs from "dayjs";
import { Link, useNavigate } from "react-router-dom";

const NavigationGuardContext = createContext({
  confirmNavigation: async (action) => {
    if (typeof action === "function") {
      action();
    }
    return true;
  },
  setBlocker: () => {},
});

const isPlainLeftClick = (event, target) => {
  return (
    event.button === 0 &&
    (!target || target === "_self") &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
};

const normalizeFormValue = (value) => {
  if (dayjs.isDayjs(value)) {
    return value.valueOf();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFormValue(item));
  }

  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((accumulator, key) => {
        const normalizedValue = normalizeFormValue(value[key]);

        if (typeof normalizedValue !== "undefined") {
          accumulator[key] = normalizedValue;
        }

        return accumulator;
      }, {});
  }

  return value;
};

const serializeFormValues = (values) => {
  return JSON.stringify(normalizeFormValue(values || {}));
};

export const NavigationGuardProvider = ({ children }) => {
  const blockerRef = useRef(null);

  const setBlocker = useCallback((id, blocker) => {
    if (!blocker) {
      if (blockerRef.current?.id === id) {
        blockerRef.current = null;
      }
      return;
    }

    blockerRef.current = { id, ...blocker };
  }, []);

  const confirmNavigation = useCallback(async (action) => {
    const blocker = blockerRef.current;

    if (blocker?.when) {
      const shouldProceed = await blocker.confirm();

      if (!shouldProceed) {
        return false;
      }
    }

    if (typeof action === "function") {
      action();
    }

    return true;
  }, []);

  const contextValue = useMemo(
    () => ({
      confirmNavigation,
      setBlocker,
    }),
    [confirmNavigation, setBlocker]
  );

  return (
    <NavigationGuardContext.Provider value={contextValue}>
      {children}
    </NavigationGuardContext.Provider>
  );
};

export const useNavigationGuard = () => useContext(NavigationGuardContext);

export const useGuardedNavigate = () => {
  const navigate = useNavigate();
  const { confirmNavigation } = useNavigationGuard();

  return useCallback(
    (to, options) => {
      return confirmNavigation(() => navigate(to, options));
    },
    [confirmNavigation, navigate]
  );
};

export const useFormDirtyState = (form) => {
  const watchedValues = Form.useWatch([], form);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const currentSnapshot = useMemo(() => {
    return serializeFormValues(
      typeof watchedValues === "undefined"
        ? form.getFieldsValue(true)
        : watchedValues
    );
  }, [form, watchedValues]);

  useEffect(() => {
    if (baselineSnapshot === null) {
      return;
    }

    setIsDirty(currentSnapshot !== baselineSnapshot);
  }, [baselineSnapshot, currentSnapshot]);

  const captureBaseline = useCallback(
    (values) => {
      const nextSnapshot = serializeFormValues(
        typeof values === "undefined" ? form.getFieldsValue(true) : values
      );

      setBaselineSnapshot(nextSnapshot);
      setIsDirty(false);
    },
    [form]
  );

  return {
    captureBaseline,
    isDirty,
  };
};

export const useUnsavedChangesGuard = ({
  when,
  title,
  content,
  okText,
  cancelText,
}) => {
  const { setBlocker } = useNavigationGuard();
  const blockerId = useRef(Symbol("unsaved-changes-blocker"));

  const confirm = useCallback(() => {
    if (!when) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      Modal.confirm({
        title,
        content,
        okText,
        cancelText,
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });
  }, [cancelText, content, okText, title, when]);

  useEffect(() => {
    const blockerKey = blockerId.current;

    setBlocker(blockerKey, when ? { when, confirm } : null);

    return () => {
      setBlocker(blockerKey, null);
    };
  }, [confirm, setBlocker, when]);

  useEffect(() => {
    if (!when) {
      return undefined;
    }

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [when]);
};

export const GuardedLink = forwardRef(
  (
    {
      children,
      onClick,
      onNavigate,
      reloadDocument,
      replace,
      state,
      target,
      to,
      preventScrollReset,
      relative,
      ...rest
    },
    ref
  ) => {
    const navigate = useNavigate();
    const { confirmNavigation } = useNavigationGuard();

    const handleClick = useCallback(
      async (event) => {
        if (typeof onClick === "function") {
          onClick(event);
        }

        if (
          reloadDocument ||
          !isPlainLeftClick(event, target) ||
          event.currentTarget.hasAttribute("download")
        ) {
          return;
        }

        event.preventDefault();

        await confirmNavigation(() => {
          if (typeof onNavigate === "function") {
            onNavigate();
          }

          navigate(to, {
            preventScrollReset,
            relative,
            replace,
            state,
          });
        });
      },
      [
        confirmNavigation,
        navigate,
        onClick,
        onNavigate,
        preventScrollReset,
        relative,
        reloadDocument,
        replace,
        state,
        target,
        to,
      ]
    );

    return (
      <Link
        {...rest}
        ref={ref}
        onClick={handleClick}
        reloadDocument={reloadDocument}
        replace={replace}
        state={state}
        target={target}
        to={to}
      >
        {children}
      </Link>
    );
  }
);

GuardedLink.displayName = "GuardedLink";

export { normalizeFormValue };
