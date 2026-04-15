import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Row, Col, Avatar, Dropdown, Table, Select, Slider, Button, Tooltip, message } from "antd";
import ChartWidget from "components/shared-components/ChartWidget";
import GoalWidget from "components/shared-components/GoalWidget";
import Card from "components/shared-components/Card";
import Flex from "components/shared-components/Flex";
import ApexCharts from "apexcharts";
import StatisticsService from "services/StattisticsService";
import FormService from "services/FormService";
import SalesBarChart from "./components/SalesBarChart";
import { SPACER } from "constants/ThemeConstant";
import {
  FileExcelOutlined,
  PrinterOutlined,
  EllipsisOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import utils from "utils";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";

const HERO_CHART_HEIGHT = "400px";
const SECONDARY_VISITOR_CHART_HEIGHT = "350px";
const SIDE_CARD_MIN_HEIGHT = 455;
const KPI_CARD_MIN_HEIGHT = 340;
const DEFAULT_AXIS = "MONTH";
const DEFAULT_TREND_MONTH_RANGE = 12;
const DEFAULT_TREND_YEAR_RANGE = 5;
const TREND_MONTH_RANGE_OPTIONS = [3, 6, 9, 12, 18, 24];
const TREND_YEAR_RANGE_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LATEST_FILTER_YEAR_RANGE = 40;
const LATEST_TABLE_DEFAULT_PAGE_SIZE = 5;
const SIMILARITY_THRESHOLD_DEFAULT = 75;
const SIMILARITY_THRESHOLD_MIN = 50;
const SIMILARITY_THRESHOLD_MAX = 100;
const DEFAULT_HERO_MONTH_RANGE = 18;
const DEFAULT_HERO_YEAR_RANGE = 6;
const UZ_SHORT_MONTHS = [
  "Янв", "Фев", "Мар", "Апр", "Май", "Июн",
  "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек",
];

const getShortMonth = (monthIndex, locale, lang) => {
  if (lang === "uz") {
    return UZ_SHORT_MONTHS[monthIndex] || `M${monthIndex + 1}`;
  }
  return new Date(2000, monthIndex, 1).toLocaleString(locale, { month: "short" });
};

const HERO_CHART_ID = "dashboard-records-chart";
const TREND_CHART_ID = "dashboard-overdue-trend-chart";
const OTK1_REGISTRATION_CHART_ID = "dashboard-otk1-registration-chart";
const OTK1_REGISTRATION4_CHART_ID = "dashboard-otk1-registration4-chart";
const LATEST_FORM_TYPES = ["registration", "registration4"];
const DASHBOARD_CHART_CONTROLS_STYLE = {
  marginTop: 10,
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  alignItems: "center",
  flexWrap: "wrap",
  width: "100%",
};
const DASHBOARD_CHART_EXPORT_BUTTON_STYLE = {
  height: 30,
  minWidth: 30,
  paddingInline: 8,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const toSafeFileToken = (value, fallback = "dashboard_chart") => {
  const normalized = typeof value === "string" ? value : "";
  const ascii = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return ascii || fallback;
};

const formatLastLogin = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const pad = (number) => String(number).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())} ${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
};

const normalizeFormNames = (forms) => [...new Set(
  (Array.isArray(forms) ? forms : [])
    .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
    .filter(Boolean)
)];

const fetchActiveLatestFormNames = async (query = "") => {
  const responses = await Promise.all(
    LATEST_FORM_TYPES.map((type) => FormService.listWithStatus(1, 500, query, type))
  );

  const mergedForms = responses.flatMap((response) => (
    Array.isArray(response?.data?.forms) ? response.data.forms : []
  ));

  return normalizeFormNames(mergedForms);
};

const CardDropdown = ({ items }) => {

  return (
    <Dropdown menu={{ items }} trigger={["click"]} placement="bottomRight">
      <a href="/#" className="text-gray font-size-lg" onClick={e => e.preventDefault()}>
        <EllipsisOutlined />
      </a>
    </Dropdown>
  );
};

export const DefaultDashboard = () => {
  const { t, i18n } = useTranslation();
  const [axis, setAxis] = useState(DEFAULT_AXIS);
  const [trendAxis, setTrendAxis] = useState(DEFAULT_AXIS);
  const [trendMonthRange, setTrendMonthRange] = useState(DEFAULT_TREND_MONTH_RANGE);
  const [trendYearRange, setTrendYearRange] = useState(DEFAULT_TREND_YEAR_RANGE);
  const [heroRows, setHeroRows] = useState([]);
  const [heroLoading, setHeroLoading] = useState(false);
  const [trendRows, setTrendRows] = useState([]);
  const [trendForms, setTrendForms] = useState([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [finishedPercentage, setFinishedPercentage] = useState(0);
  const [finishedCount, setFinishedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [similarityThreshold, setSimilarityThreshold] = useState(SIMILARITY_THRESHOLD_DEFAULT);
  const [similarityThresholdDraft, setSimilarityThresholdDraft] = useState(SIMILARITY_THRESHOLD_DEFAULT);
  const [similarityThresholdMin, setSimilarityThresholdMin] = useState(SIMILARITY_THRESHOLD_MIN);
  const [similarityThresholdMax, setSimilarityThresholdMax] = useState(SIMILARITY_THRESHOLD_MAX);
  const [similarityThresholdLoading, setSimilarityThresholdLoading] = useState(false);
  const [similarityThresholdSaving, setSimilarityThresholdSaving] = useState(false);
  const [latestRows, setLatestRows] = useState([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestPageNumber, setLatestPageNumber] = useState(1);
  const [latestPageSize, setLatestPageSize] = useState(LATEST_TABLE_DEFAULT_PAGE_SIZE);
  const [latestTotal, setLatestTotal] = useState(0);
  const [latestYear, setLatestYear] = useState(() => new Date().getFullYear());
  const [finishedYear, setFinishedYear] = useState(() => new Date().getFullYear());
  const [finishedModel, setFinishedModel] = useState("registration");
  const [latestForms, setLatestForms] = useState([]);
  const [latestFormOptions, setLatestFormOptions] = useState([]);
  const [latestFormsLoading, setLatestFormsLoading] = useState(false);
  const [latestSortedColumns, setLatestSortedColumns] = useState([]);
  const [exportingCharts, setExportingCharts] = useState({});
  const { direction } = useSelector(state => state.theme);
  const { role } = useSelector(state => state.auth);

  const axisOptions = [
    { value: "MONTH", label: t("dashboard_axis_month") },
    { value: "YEAR", label: t("dashboard_axis_year") },
  ];

  const trendRangeOptions = useMemo(
    () => (trendAxis === "MONTH" ? TREND_MONTH_RANGE_OPTIONS : TREND_YEAR_RANGE_OPTIONS)
      .map((value) => ({ value, label: String(value) })),
    [trendAxis]
  );

  const trendRangeValue = trendAxis === "MONTH" ? trendMonthRange : trendYearRange;

  const latestYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();

    return Array.from({ length: LATEST_FILTER_YEAR_RANGE }, (_, index) => {
      const yearValue = currentYear - index;
      return {
        value: yearValue,
        label: String(yearValue),
      };
    });
  }, []);

  const finishedYearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();

    return Array.from({ length: LATEST_FILTER_YEAR_RANGE }, (_, index) => {
      const yearValue = currentYear - index;
      return {
        value: yearValue,
        label: String(yearValue),
      };
    });
  }, []);

  const finishedModelOptions = useMemo(() => [
    { value: "registration", label: t("registration") },
    { value: "registration4", label: t("registration4") },
  ], [t]);

  const latestSortOrderMap = useMemo(() => {
    const map = {};
    latestSortedColumns.forEach((item) => {
      if (!item?.field) return;
      map[item.field] = item.order === "ASC" ? "ascend" : "descend";
    });
    return map;
  }, [latestSortedColumns]);

  const loadLatestFormOptions = useCallback(async (query = "") => {
    setLatestFormsLoading(true);
    try {
      const formNames = await fetchActiveLatestFormNames(query);
      const mergedNames = [...new Set([...latestForms, ...formNames])];

      setLatestFormOptions(mergedNames.map((formName) => ({
        value: formName,
        label: formName,
      })));
    } catch (error) {
      setLatestFormOptions(latestForms.map((formName) => ({
        value: formName,
        label: formName,
      })));
      message.error(t("dashboard_form_overdue_loading_error"));
    } finally {
      setLatestFormsLoading(false);
    }
  }, [latestForms, t]);

  const heroCategories = useMemo(() => {
    const localeMap = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" };
    const locale = localeMap[i18n.language] || "ru-RU";
    return heroRows.map((item) => {
      if (axis === "MONTH") {
        const monthIndex = (item?.month || 1) - 1;
        const monthName = getShortMonth(monthIndex, locale, i18n.language);
        return `${monthName} ${item?.year || ""}`;
      }
      return String(item?.year || "");
    });
  }, [heroRows, axis, i18n.language]);

  const heroSeries = [
    {
      name: t("dashboard_series_reject"),
      type: "column",
      data: heroRows.map((item) => Number(item?.otk1_count) || 0),
    },
    {
      name: t("dashboard_series_registered_forms_lists"),
      type: "line",
      data: heroRows.map((item) => Number(item?.open_count) || 0),
    },
    {
      name: t("dashboard_series_sp_completed"),
      type: "line",
      data: heroRows.map((item) => Number(item?.close_count) || 0),
    },
    {
      name: t("dashboard_series_access"),
      type: "line",
      data: heroRows.map((item) => Number(item?.access_count) || 0),
    },
  ];

  const heroChartOptions = useMemo(() => {
    const axisMaxValue = Math.max(
      ...heroRows.map((item) => Math.max(
        Number(item?.otk1_count) || 0,
        Number(item?.open_count) || 0,
        Number(item?.close_count) || 0,
        Number(item?.access_count) || 0
      )),
      0
    );
    const normalizedAxisMax = axisMaxValue <= 5 ? 5 : Math.ceil(axisMaxValue * 1.15);

    return {
      colors: ["#f4c430", "#5b9bd5", "#ed7d31", "#a5a5a5"],
      chart: {
        id: HERO_CHART_ID,
        toolbar: {
          show: false,
        },
        zoom: {
          enabled: false,
        },
      },
      legend: {
        position: "bottom",
        horizontalAlign: "center",
        offsetX: 0,
        offsetY: 8,
        itemMargin: { vertical: 8, horizontal: 12 },
      },
      stroke: {
        width: [0, 3, 3, 3],
        curve: "smooth",
        lineCap: "round",
      },
      plotOptions: {
        bar: {
          columnWidth: "20%",
          borderRadius: 2,
        },
      },
      dataLabels: {
        enabled: false,
      },
      markers: {
        size: 0,
      },
      yaxis: {
        show: true,
        min: 0,
        max: normalizedAxisMax,
        tickAmount: 6,
        forceNiceScale: true,
        decimalsInFloat: 0,
        crosshairs: {
          show: false,
        },
        tooltip: {
          enabled: false,
        },
      },
      xaxis: {
        type: "category",
        categories: heroCategories,
        crosshairs: {
          show: true,
          stroke: {
            dashArray: 4,
          },
        },
      },
      grid: {
        xaxis: {
          lines: { show: false },
        },
        yaxis: {
          lines: { show: true },
        },
        padding: {
          top: 18,
        },
      },
      tooltip: {
        shared: true,
        intersect: false,
        y: {
          formatter: (val) => `${val}`,
        },
      },
    };
  }, [heroRows, heroCategories, t]);

  const trendChartData = useMemo(() => {
    const rows = Array.isArray(trendRows) ? trendRows : [];
    if (rows.length === 0) {
      return {
        categories: [],
        series: [],
      };
    }

    const localeMap = { ru: "ru-RU", uz: "uz-UZ", en: "en-US" };
    const locale = localeMap[i18n.language] || "ru-RU";
    const bucketMap = new Map();
    const valueMap = new Map();
    const formsSet = new Set();

    rows.forEach((item) => {
      const yearValue = Number(item?.year) || 0;
      if (!yearValue) return;

      const monthValue = trendAxis === "MONTH" ? Number(item?.month) || 1 : null;
      const bucketKey = `${yearValue}-${monthValue === null ? 0 : monthValue}`;
      const formName = typeof item?.form_reg === "string" ? item.form_reg : "";
      const rowValue = Number(item?.value) || 0;

      if (!bucketMap.has(bucketKey)) {
        bucketMap.set(bucketKey, {
          key: bucketKey,
          year: yearValue,
          month: monthValue,
        });
      }

      if (formName) {
        formsSet.add(formName);
        valueMap.set(`${formName}::${bucketKey}`, rowValue);
      }
    });

    const buckets = Array.from(bucketMap.values()).sort((a, b) => {
      if (a.year === b.year) {
        return (a.month || 0) - (b.month || 0);
      }
      return a.year - b.year;
    });

    const categories = buckets.map((bucket) => {
      if (trendAxis === "MONTH") {
        const monthIndex = (bucket.month || 1) - 1;
        const monthName = getShortMonth(monthIndex, locale, i18n.language);
        return `${monthName} ${bucket.year}`;
      }
      return String(bucket.year);
    });

    const forms = Array.from(formsSet);
    const series = forms.map((formName) => ({
      name: formName,
      data: buckets.map((bucket) => valueMap.get(`${formName}::${bucket.key}`) || 0),
    }));

    return {
      categories,
      series,
    };
  }, [trendRows, trendAxis, i18n.language]);

  const trendChartOptions = useMemo(() => ({
    chart: {
      id: TREND_CHART_ID,
      toolbar: {
        show: false,
      },
    },
    legend: {
      show: false,
    },
    yaxis: {
      decimalsInFloat: 0,
      labels: {
        formatter: (val) => `${Math.round(Number(val) || 0)}`,
      },
    },
    tooltip: {
      y: {
        formatter: (val) => `${Math.round(Number(val) || 0)}`,
      },
    },
  }), []);

  const latestTransactionOption = useMemo(() => ([
    {
      key: "refresh",
      label: (
        <Flex alignItems="center" gap={SPACER[2]}>
          <ReloadOutlined />
          <span className="ml-2">{t("dashboard_latest_action_refresh")}</span>
        </Flex>
      ),
    },
    {
      key: "print",
      label: (
        <Flex alignItems="center" gap={SPACER[2]}>
          <PrinterOutlined />
          <span className="ml-2">{t("dashboard_latest_action_print")}</span>
        </Flex>
      ),
    },
    {
      key: "export",
      label: (
        <Flex alignItems="center" gap={SPACER[2]}>
          <FileExcelOutlined />
          <span className="ml-2">{t("dashboard_latest_action_export")}</span>
        </Flex>
      ),
    },
  ]), [t]);

  const handleLatestTableChange = useCallback((pagination, filters, sorter, extra) => {
    const nextPageSize = Number(pagination?.pageSize) || LATEST_TABLE_DEFAULT_PAGE_SIZE;
    setLatestPageSize(nextPageSize);

    if (extra?.action === "sort") {
      setLatestPageNumber(1);
    } else {
      const nextPageNumber = Number(pagination?.current) || 1;
      setLatestPageNumber(nextPageNumber);
    }

    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const normalizedSorters = sorters
      .filter((item) => item?.order)
      .map((item) => ({
        field: item?.field || item?.columnKey || item?.column?.key,
        order: item.order === "ascend" ? "ASC" : "DESC",
        priority: Number(item?.column?.sorter?.multiple) || Number.MAX_SAFE_INTEGER,
      }))
      .filter((item) => typeof item.field === "string" && item.field.trim() !== "")
      .sort((a, b) => a.priority - b.priority)
      .map(({ field, order }) => ({ field: field.trim(), order }));

    setLatestSortedColumns(normalizedSorters);
  }, []);

  const tableColumns = useMemo(() => ([
    {
      title: t("dashboard_latest_column_customer"),
      dataIndex: "fullName",
      key: "fullName",
      sorter: { multiple: 1 },
      sortDirections: ["ascend", "descend"],
      sortOrder: latestSortOrderMap.fullName || null,
      render: (text, record) => {
        const hasPhoto = typeof record?.photo === "string" && /^https?:\/\//i.test(record.photo);
        return (
          <div className="d-flex align-items-center">
            <Avatar size={30} className="font-size-sm" src={hasPhoto ? record.photo : undefined}>
              {hasPhoto ? null : utils.getNameInitial(text || "")}
            </Avatar>
            <span className="ml-2">{text}</span>
          </div>
        );
      },
    },
    {
      title: t("dashboard_latest_column_registered"),
      dataIndex: "registeredCount",
      key: "registeredCount",
      sorter: { multiple: 2 },
      sortDirections: ["ascend", "descend"],
      sortOrder: latestSortOrderMap.registeredCount || null,
    },
    {
      title: t("dashboard_latest_column_overdue"),
      dataIndex: "overdueCount",
      key: "overdueCount",
      sorter: { multiple: 3 },
      sortDirections: ["ascend", "descend"],
      sortOrder: latestSortOrderMap.overdueCount || null,
    },
    {
      title: () => <div className="text-right">{t("last_login")}</div>,
      dataIndex: "lastLoginAt",
      key: "lastLoginAt",
      sorter: { multiple: 4 },
      sortDirections: ["ascend", "descend"],
      sortOrder: latestSortOrderMap.lastLoginAt || null,
      render: (value) => <div className="text-right">{formatLastLogin(value)}</div>,
    },
  ]), [latestSortOrderMap, t]);

  useEffect(() => {
    let cancelled = false;

    const loadHeroData = async () => {
      setHeroLoading(true);
      try {
        const response = await StatisticsService.countedRecords({ x_axis: axis });
        if (cancelled) return;
        setHeroRows(Array.isArray(response?.data?.data) ? response.data.data : []);
      } catch (error) {
        if (!cancelled) {
          setHeroRows([]);
          message.error(t("dashboard_loading_error"));
        }
      } finally {
        if (!cancelled) {
          setHeroLoading(false);
        }
      }
    };

    loadHeroData();

    return () => {
      cancelled = true;
    };
  }, [axis, t]);

  useEffect(() => {
    let cancelled = false;

    const loadTrendForms = async () => {
      try {
        const response = await FormService.listWithStatus(1, 500, "", "registration");
        if (cancelled) return;

        const forms = normalizeFormNames(response?.data?.forms);

        setTrendForms(forms);
      } catch (error) {
        if (!cancelled) {
          setTrendForms([]);
          message.error(t("dashboard_form_overdue_loading_error"));
        }
      }
    };

    loadTrendForms();

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const loadSimilarityThreshold = async () => {
      setSimilarityThresholdLoading(true);
      try {
        const response = await StatisticsService.getSimilarityThreshold({});
        if (cancelled) return;

        const data = response?.data?.data || {};
        const nextMin = Number(data?.min);
        const nextMax = Number(data?.max);
        const safeMin = Number.isInteger(nextMin) ? nextMin : SIMILARITY_THRESHOLD_MIN;
        const safeMax = Number.isInteger(nextMax) ? nextMax : SIMILARITY_THRESHOLD_MAX;
        const minValue = Math.min(safeMin, safeMax);
        const maxValue = Math.max(safeMin, safeMax);

        const nextThreshold = Number(data?.threshold_percent);
        const safeThreshold = Number.isInteger(nextThreshold)
          ? Math.min(maxValue, Math.max(minValue, nextThreshold))
          : SIMILARITY_THRESHOLD_DEFAULT;

        setSimilarityThresholdMin(minValue);
        setSimilarityThresholdMax(maxValue);
        setSimilarityThreshold(safeThreshold);
        setSimilarityThresholdDraft(safeThreshold);
      } catch (error) {
        if (!cancelled) {
          setSimilarityThresholdMin(SIMILARITY_THRESHOLD_MIN);
          setSimilarityThresholdMax(SIMILARITY_THRESHOLD_MAX);
          setSimilarityThreshold(SIMILARITY_THRESHOLD_DEFAULT);
          setSimilarityThresholdDraft(SIMILARITY_THRESHOLD_DEFAULT);
          message.error(t("dashboard_similarity_threshold_load_error"));
        }
      } finally {
        if (!cancelled) {
          setSimilarityThresholdLoading(false);
        }
      }
    };

    loadSimilarityThreshold();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const canEditSimilarityThreshold = role === "superAdmin";
  const hasSimilarityThresholdChanges = similarityThresholdDraft !== similarityThreshold;
  const thresholdInfoStyle = {
    marginTop: 8,
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(62, 121, 247, 0.08)",
    transition: "opacity 220ms ease, transform 220ms ease, box-shadow 220ms ease",
    opacity: similarityThresholdLoading ? 0.72 : 1,
    transform: hasSimilarityThresholdChanges ? "translateY(-1px)" : "translateY(0px)",
    boxShadow: hasSimilarityThresholdChanges
      ? "0 6px 14px rgba(62, 121, 247, 0.14)"
      : "0 2px 8px rgba(62, 121, 247, 0.08)",
  };
  const thresholdControlStyle = {
    marginTop: 8,
    overflow: "hidden",
    maxHeight: canEditSimilarityThreshold ? 240 : 0,
    opacity: canEditSimilarityThreshold ? 1 : 0,
    transform: canEditSimilarityThreshold ? "translateY(0px)" : "translateY(4px)",
    transition: "max-height 260ms ease, opacity 220ms ease, transform 220ms ease",
  };
  const thresholdButtonStyle = {
    transition: "transform 180ms ease, box-shadow 180ms ease",
    transform: hasSimilarityThresholdChanges ? "translateY(0px)" : "translateY(1px)",
    boxShadow: hasSimilarityThresholdChanges
      ? "0 4px 10px rgba(24, 144, 255, 0.22)"
      : "none",
  };

  const handleSimilarityThresholdSave = async () => {
    if (!canEditSimilarityThreshold) {
      return;
    }

    const nextThreshold = Number(similarityThresholdDraft);
    if (!Number.isInteger(nextThreshold)) {
      message.error(t("dashboard_similarity_threshold_save_error"));
      return;
    }

    const normalizedThreshold = Math.min(
      similarityThresholdMax,
      Math.max(similarityThresholdMin, nextThreshold)
    );

    if (normalizedThreshold === similarityThreshold) {
      return;
    }

    setSimilarityThresholdSaving(true);
    try {
      const response = await StatisticsService.updateSimilarityThreshold({
        threshold_percent: normalizedThreshold,
      });
      const data = response?.data?.data || {};

      const updatedThreshold = Number(data?.threshold_percent);
      const safeThreshold = Number.isInteger(updatedThreshold)
        ? Math.min(similarityThresholdMax, Math.max(similarityThresholdMin, updatedThreshold))
        : normalizedThreshold;

      setSimilarityThreshold(safeThreshold);
      setSimilarityThresholdDraft(safeThreshold);
      message.success(t("dashboard_similarity_threshold_save_success"));
    } catch (error) {
      message.error(t("dashboard_similarity_threshold_save_error"));
    } finally {
      setSimilarityThresholdSaving(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadTrendData = async () => {
      if (!Array.isArray(trendForms) || trendForms.length === 0) {
        setTrendRows([]);
        return;
      }

      setTrendLoading(true);
      try {
        const response = await StatisticsService.formOverdueTrend({
          x_axis: trendAxis,
          month: trendMonthRange,
          year: trendYearRange,
          form_reg: trendForms,
        });
        if (cancelled) return;

        setTrendRows(Array.isArray(response?.data?.data) ? response.data.data : []);
      } catch (error) {
        if (!cancelled) {
          setTrendRows([]);
          message.error(t("dashboard_form_overdue_loading_error"));
        }
      } finally {
        if (!cancelled) {
          setTrendLoading(false);
        }
      }
    };

    loadTrendData();

    return () => {
      cancelled = true;
    };
  }, [trendAxis, trendForms, trendMonthRange, trendYearRange, t]);

  useEffect(() => {
    let cancelled = false;

    const loadFinishedPercentage = async () => {
      try {
        const response = await StatisticsService.finishedRegistrationPercentage({ year: finishedYear, model: finishedModel });
        if (cancelled) return;

        const data = response?.data?.data || {};
        const nextPercentage = Number(data?.percentage) || 0;
        const nextFinishedCount = Number(data?.finished_count) || 0;
        const nextTotalCount = Number(data?.total_count) || 0;

        setFinishedPercentage(Math.min(100, Math.max(0, nextPercentage)));
        setFinishedCount(Math.max(0, nextFinishedCount));
        setTotalCount(Math.max(0, nextTotalCount));
      } catch (error) {
        if (!cancelled) {
          setFinishedPercentage(0);
          setFinishedCount(0);
          setTotalCount(0);
          message.error(t("dashboard_finished_target_loading_error"));
        }
      }
    };

    loadFinishedPercentage();

    return () => {
      cancelled = true;
    };
  }, [finishedYear, finishedModel, t]);

  useEffect(() => {
    let cancelled = false;

    const loadLatestTransactions = async () => {
      setLatestLoading(true);
      try {
        const response = await StatisticsService.latestTransactions({
          pageNumber: latestPageNumber,
          pageSize: latestPageSize,
          year: latestYear,
          forms: latestForms,
          sortFields: latestSortedColumns,
        });

        if (cancelled) return;

        const data = response?.data?.data || {};
        setLatestRows(Array.isArray(data?.rows) ? data.rows : []);
        setLatestTotal(Number(data?.pagination?.total) || 0);
      } catch (error) {
        if (!cancelled) {
          setLatestRows([]);
          setLatestTotal(0);
          message.error(t("dashboard_latest_loading_error"));
        }
      } finally {
        if (!cancelled) {
          setLatestLoading(false);
        }
      }
    };

    loadLatestTransactions();

    return () => {
      cancelled = true;
    };
  }, [latestForms, latestPageNumber, latestPageSize, latestSortedColumns, latestYear, t]);

  const runChartExport = useCallback(async ({
    chartStateKey,
    chartKey,
    chartId,
    title,
    periodLabel,
    filters,
    fileNamePrefix,
  }) => {
    setExportingCharts((prev) => ({ ...prev, [chartStateKey]: true }));

    try {
      const chartImagePayload = await ApexCharts.exec(chartId, "dataURI");
      const imageDataUrl = chartImagePayload?.imgURI;

      if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image")) {
        throw new Error("Unable to capture chart image");
      }

      const response = await StatisticsService.exportDashboardChart({
        chartKey,
        title,
        periodLabel,
        imageDataUrl,
        filters,
      });

      const link = response?.data?.link;
      if (response?.data?.code !== 200 || typeof link !== "string" || !link) {
        throw new Error("Invalid export response");
      }

      const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const safePrefix = toSafeFileToken(fileNamePrefix, "dashboard_chart");
      const downloadName = `${safePrefix}_${timestamp}`;
      const separator = link.includes("?") ? "&" : "?";
      const downloadUrl = `${link}${separator}newFileName=${encodeURIComponent(downloadName)}`;

      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.setAttribute("download", downloadName);
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      message.success(t("report_downloaded_successfully"));
    } catch (error) {
      message.error(t("report_download_failed"));
    } finally {
      setExportingCharts((prev) => ({ ...prev, [chartStateKey]: false }));
    }
  }, [t]);

  useEffect(() => {
    loadLatestFormOptions("");
  }, [loadLatestFormOptions]);

  const handleHeroChartExport = useCallback(() => {
    const periodLabel = axis === "MONTH"
      ? `${t("dashboard_axis_month")} (${DEFAULT_HERO_MONTH_RANGE})`
      : `${t("dashboard_axis_year")} (${DEFAULT_HERO_YEAR_RANGE})`;

    runChartExport({
      chartStateKey: "counted_records",
      chartKey: "counted_records",
      chartId: HERO_CHART_ID,
      title: t("dashboard_records_title"),
      periodLabel,
      filters: {
        x_axis: axis,
        month: DEFAULT_HERO_MONTH_RANGE,
        year: DEFAULT_HERO_YEAR_RANGE,
      },
      fileNamePrefix: t("dashboard_records_title"),
    });
  }, [axis, runChartExport, t]);

  const handleTrendChartExport = useCallback(() => {
    const selectedRange = trendAxis === "MONTH" ? trendMonthRange : trendYearRange;
    const periodLabel = trendAxis === "MONTH"
      ? `${selectedRange} ${t("dashboard_axis_month")}`
      : `${selectedRange} ${t("dashboard_axis_year")}`;

    runChartExport({
      chartStateKey: "form_overdue_trend",
      chartKey: "form_overdue_trend",
      chartId: TREND_CHART_ID,
      title: t("dashboard_unique_visitors_title"),
      periodLabel,
      filters: {
        x_axis: trendAxis,
        month: trendMonthRange,
        year: trendYearRange,
      },
      fileNamePrefix: t("dashboard_unique_visitors_title"),
    });
  }, [trendAxis, trendMonthRange, trendYearRange, runChartExport, t]);

  const handleTopOtk1ChartExport = useCallback(({ years, model }) => {
    const isRegistration4 = model === "registration4";
    const chartKey = isRegistration4 ? "top_otk1_registration4" : "top_otk1_registration";
    const chartId = isRegistration4 ? OTK1_REGISTRATION4_CHART_ID : OTK1_REGISTRATION_CHART_ID;
    const title = isRegistration4 ? t("dashboard_otk1_forms_title") : t("dashboard_otk1_title");

    runChartExport({
      chartStateKey: chartKey,
      chartKey,
      chartId,
      title,
      periodLabel: `${years} ${t("dashboard_otk1_years_label")}`,
      filters: {
        year: years,
      },
      fileNamePrefix: title,
    });
  }, [runChartExport, t]);

  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={18}>
          <ChartWidget
            title={t("dashboard_records_title")}
            series={heroSeries}
            xAxis={heroCategories}
            height={HERO_CHART_HEIGHT}
            direction={direction}
            type="line"
            customOptions={heroChartOptions}
            extra={
              <div style={DASHBOARD_CHART_CONTROLS_STYLE}>
                <Select
                  value={axis}
                  options={axisOptions}
                  size="small"
                  style={{ minWidth: 140 }}
                  onChange={(value) => setAxis(value)}
                  loading={heroLoading}
                  disabled={exportingCharts.counted_records}
                />
                <Tooltip title={t("export")}>
                  <Button
                    size="small"
                    icon={<FileExcelOutlined />}
                    style={DASHBOARD_CHART_EXPORT_BUTTON_STYLE}
                    onClick={handleHeroChartExport}
                    loading={Boolean(exportingCharts.counted_records)}
                    disabled={heroLoading || Boolean(exportingCharts.counted_records)}
                  />
                </Tooltip>
              </div>
            }
          />
        </Col>
        <Col xs={24} sm={24} md={24} lg={6}>
          <GoalWidget
            cardTitle={
              <div>
                <div style={{ textAlign: "center", marginBottom: 4 }}>{t("dashboard_finished_target_title")}</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                  <Select
                    value={finishedModel}
                    options={finishedModelOptions}
                    size="small"
                    style={{ minWidth: 100 }}
                    onChange={(value) => setFinishedModel(value)}
                  />
                  <Select
                    value={finishedYear}
                    options={finishedYearOptions}
                    size="small"
                    style={{ minWidth: 70 }}
                    onChange={(value) => setFinishedYear(value)}
                  />
                </div>
              </div>
            }
            value={finishedPercentage}
            size={140}
            extra={(
              <div>
                <div>{t("dashboard_finished_target_counts", { finished: finishedCount, total: totalCount })}</div>
              </div>
            )}
            cardStyle={{ minHeight: SIDE_CARD_MIN_HEIGHT }}
            cardBodyStyle={{ padding: "12px", paddingTop: "4px" }}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={8}>
          <SalesBarChart
            cardMinHeight={KPI_CARD_MIN_HEIGHT}
            model="registration"
            chartId={OTK1_REGISTRATION_CHART_ID}
            onExport={handleTopOtk1ChartExport}
            exporting={Boolean(exportingCharts.top_otk1_registration)}
          />
        </Col>
        <Col xs={24} sm={24} md={24} lg={8}>
          <SalesBarChart
            cardMinHeight={KPI_CARD_MIN_HEIGHT}
            model="registration4"
            chartId={OTK1_REGISTRATION4_CHART_ID}
            onExport={handleTopOtk1ChartExport}
            exporting={Boolean(exportingCharts.top_otk1_registration4)}
          />
        </Col>
        <Col xs={24} sm={24} md={24} lg={8}>
          <ChartWidget
            title={t("dashboard_unique_visitors_title")}
            series={trendChartData.series}
            xAxis={trendChartData.categories}
            height={SECONDARY_VISITOR_CHART_HEIGHT}
            direction={direction}
            customOptions={trendChartOptions}
            extra={
              <div style={DASHBOARD_CHART_CONTROLS_STYLE}>
                <Select
                  value={trendAxis}
                  options={axisOptions}
                  size="small"
                  style={{ minWidth: 140 }}
                  onChange={(value) => setTrendAxis(value)}
                  loading={trendLoading}
                />
                <Select
                  value={trendRangeValue}
                  options={trendRangeOptions}
                  size="small"
                  style={{ minWidth: 90 }}
                  onChange={(value) => {
                    if (trendAxis === "MONTH") {
                      setTrendMonthRange(value);
                    } else {
                      setTrendYearRange(value);
                    }
                  }}
                  loading={trendLoading}
                  disabled={Boolean(exportingCharts.form_overdue_trend)}
                />
                <Tooltip title={t("export")}>
                  <Button
                    size="small"
                    icon={<FileExcelOutlined />}
                    style={DASHBOARD_CHART_EXPORT_BUTTON_STYLE}
                    onClick={handleTrendChartExport}
                    loading={Boolean(exportingCharts.form_overdue_trend)}
                    disabled={trendLoading || Boolean(exportingCharts.form_overdue_trend)}
                  />
                </Tooltip>
              </div>
            }
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={16} lg={16}>
          <Card
            title={t("dashboard_latest_title")}
            extra={(
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                <Select
                  mode="multiple"
                  value={latestForms}
                  options={latestFormOptions}
                  size="small"
                  style={{ minWidth: 220, maxWidth: 360 }}
                  placeholder={t("select_form")}
                  onChange={(value) => {
                    setLatestPageNumber(1);
                    setLatestForms(value);
                  }}
                  loading={latestFormsLoading}
                  disabled={latestLoading || latestFormsLoading}
                  showSearch
                  filterOption={false}
                  onSearch={loadLatestFormOptions}
                  onClear={() => loadLatestFormOptions("")}
                  allowClear
                  maxTagCount="responsive"
                />
                <Select
                  value={latestYear}
                  options={latestYearOptions}
                  size="small"
                  style={{ minWidth: 105 }}
                  placeholder={t("dashboard_latest_filter_year")}
                  onChange={(value) => {
                    setLatestPageNumber(1);
                    setLatestYear(value);
                  }}
                  loading={latestLoading}
                  disabled={latestLoading}
                />
                {/* <CardDropdown items={latestTransactionOption} /> */}
              </div>
            )}
          >
            <Table
              className="no-border-last"
              columns={tableColumns}
              dataSource={latestRows}
              rowKey='id'
              loading={latestLoading}
              onChange={handleLatestTableChange}
              pagination={{
                current: latestPageNumber,
                pageSize: latestPageSize,
                total: latestTotal,
                showSizeChanger: true,
                pageSizeOptions: ["10", "20", "50", "100"],
              }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={24} md={8} lg={8}>
          <Card
            title={t("dashboard_similarity_threshold_title")}
            bodyStyle={{ padding: "12px" }}
          >
            <div style={thresholdInfoStyle}>
              {t("dashboard_similarity_threshold_label", { percentage: similarityThreshold })}
            </div>
            <div style={thresholdControlStyle}>
              {canEditSimilarityThreshold ? (
                <div>
                  <div className="text-muted font-size-sm mb-1">
                    {t("dashboard_similarity_threshold_hint", {
                      min: similarityThresholdMin,
                      max: similarityThresholdMax,
                    })}
                  </div>
                  <Slider
                    min={similarityThresholdMin}
                    max={similarityThresholdMax}
                    step={1}
                    value={similarityThresholdDraft}
                    disabled={similarityThresholdLoading || similarityThresholdSaving}
                    onChange={(value) => {
                      const numericValue = Array.isArray(value) ? value[0] : value;
                      setSimilarityThresholdDraft(numericValue);
                    }}
                  />
                  <div className="d-flex justify-content-end mt-2">
                    <Button
                      size="small"
                      type="primary"
                      style={thresholdButtonStyle}
                      loading={similarityThresholdSaving}
                      disabled={
                        similarityThresholdLoading ||
                        similarityThresholdSaving ||
                        !hasSimilarityThresholdChanges
                      }
                      onClick={handleSimilarityThresholdSave}
                    >
                      {t("dashboard_similarity_threshold_save")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </Card>
        </Col>
      </Row>
    </>
  );
};


export default DefaultDashboard;
