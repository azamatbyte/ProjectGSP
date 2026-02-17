import React, { useEffect, useMemo, useState } from "react";
import { Row, Col, Avatar, Dropdown, Table, Tag, Select, message } from "antd";
import ChartWidget from "components/shared-components/ChartWidget";
import GoalWidget from "components/shared-components/GoalWidget";
import Card from "components/shared-components/Card";
import Flex from "components/shared-components/Flex";
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
const LATEST_TABLE_DEFAULT_PAGE_SIZE = 5;

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
  const [latestRows, setLatestRows] = useState([]);
  const [latestLoading, setLatestLoading] = useState(false);
  const [latestPageNumber, setLatestPageNumber] = useState(1);
  const [latestPageSize, setLatestPageSize] = useState(LATEST_TABLE_DEFAULT_PAGE_SIZE);
  const [latestTotal, setLatestTotal] = useState(0);
  const { direction } = useSelector(state => state.theme);

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

  const heroCategories = useMemo(() => {
    const localeMap = { ru: "ru-RU", uz: "uz-UZ" };
    const locale = localeMap[i18n.language] || "ru-RU";
    return heroRows.map((item) => {
      if (axis === "MONTH") {
        const monthName = new Date(item?.year || 2000, (item?.month || 1) - 1)
          .toLocaleString(locale, { month: "short" });
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
    const leftAxisMaxValue = Math.max(
      ...heroRows.map((item) => Math.max(
        Number(item?.otk1_count) || 0,
        Number(item?.close_count) || 0,
        Number(item?.access_count) || 0
      )),
      0
    );
    const rightAxisMaxValue = Math.max(
      ...heroRows.map((item) => Number(item?.open_count) || 0),
      0
    );
    const normalizedLeftMax = leftAxisMaxValue <= 5 ? 5 : Math.ceil(leftAxisMaxValue * 1.15);
    const normalizedRightMax = rightAxisMaxValue <= 5 ? 5 : Math.ceil(rightAxisMaxValue * 1.15);

    return {
      colors: ["#f4c430", "#5b9bd5", "#ed7d31", "#a5a5a5"],
      chart: {
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
      yaxis: [
        {
          seriesName: t("dashboard_series_reject"),
          show: true,
          min: 0,
          max: normalizedLeftMax,
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
        {
          seriesName: t("dashboard_series_registered_forms_lists"),
          show: true,
          opposite: true,
          min: 0,
          max: normalizedRightMax,
          tickAmount: 6,
          decimalsInFloat: 0,
          axisBorder: {
            show: true,
            color: "#5b9bd5",
          },
          axisTicks: {
            show: true,
            color: "#5b9bd5",
          },
          labels: {
            style: {
              colors: ["#5b9bd5"],
            },
          },
          title: {
            text: t("dashboard_series_registered_forms_lists"),
            style: {
              color: "#5b9bd5",
            },
          },
          crosshairs: {
            show: false,
          },
          tooltip: {
            enabled: false,
          },
        },
        {
          seriesName: t("dashboard_series_reject"),
          show: false,
          min: 0,
          max: normalizedLeftMax,
          tickAmount: 6,
          forceNiceScale: true,
          decimalsInFloat: 0,
        },
        {
          seriesName: t("dashboard_series_reject"),
          show: false,
          min: 0,
          max: normalizedLeftMax,
          tickAmount: 6,
          forceNiceScale: true,
          decimalsInFloat: 0,
        },
      ],
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

    const localeMap = { ru: "ru-RU", uz: "uz-UZ" };
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
        const monthName = new Date(bucket.year, (bucket.month || 1) - 1, 1)
          .toLocaleString(locale, { month: "short" });
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
    legend: {
      show: false,
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

  const tableColumns = useMemo(() => ([
    {
      title: t("dashboard_latest_column_customer"),
      dataIndex: "fullName",
      key: "fullName",
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
    },
    {
      title: t("dashboard_latest_column_overdue"),
      dataIndex: "overdueCount",
      key: "overdueCount",
    },
    {
      title: () => <div className="text-right">{t("dashboard_latest_column_status")}</div>,
      key: "status",
      render: (_, record) => {
        const normalized = String(record?.status || "").toLowerCase();
        const color = normalized === "active" ? "green" : normalized === "inactive" ? "orange" : "default";
        const statusLabel = t(`dashboard_latest_status_${normalized}`, { defaultValue: record?.status || "-" });

        return (
          <div className="text-right">
            <Tag className="mr-0" color={color}>{statusLabel}</Tag>
          </div>
        );
      },
    },
  ]), [t]);

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

        const forms = Array.isArray(response?.data?.forms)
          ? [...new Set(response.data.forms
            .map((item) => (typeof item?.name === "string" ? item.name.trim() : ""))
            .filter(Boolean))]
          : [];

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
        const response = await StatisticsService.finishedRegistrationPercentage({});
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
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const loadLatestTransactions = async () => {
      setLatestLoading(true);
      try {
        const response = await StatisticsService.latestTransactions({
          pageNumber: latestPageNumber,
          pageSize: latestPageSize,
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
  }, [latestPageNumber, latestPageSize, t]);

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
              <div style={{ marginTop: 26 }}>
                <Select
                  value={axis}
                  options={axisOptions}
                  size="small"
                  style={{ minWidth: 140 }}
                  onChange={(value) => setAxis(value)}
                  loading={heroLoading}
                />
              </div>
            }
          />
        </Col>
        <Col xs={24} sm={24} md={24} lg={6}>
          <GoalWidget
            title={t("dashboard_finished_target_title")}
            value={finishedPercentage}
            size={140}
            subtitle={t("dashboard_finished_target_subtitle", { percentage: finishedPercentage })}
            extra={t("dashboard_finished_target_counts", { finished: finishedCount, total: totalCount })}
            cardStyle={{ minHeight: SIDE_CARD_MIN_HEIGHT }}
            cardBodyStyle={{ padding: "12px" }}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={8}>
          <SalesBarChart cardMinHeight={KPI_CARD_MIN_HEIGHT} model="registration" />
        </Col>
        <Col xs={24} sm={24} md={24} lg={8}>
          <SalesBarChart cardMinHeight={KPI_CARD_MIN_HEIGHT} model="registration4" />
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
              <div style={{ marginTop: 26, display: "flex", gap: 8 }}>
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
                />
              </div>
            }
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <Card title={t("dashboard_latest_title")} extra={<CardDropdown items={latestTransactionOption} />}>
            <Table
              className="no-border-last"
              columns={tableColumns}
              dataSource={latestRows}
              rowKey='id'
              loading={latestLoading}
              pagination={{
                current: latestPageNumber,
                pageSize: latestPageSize,
                total: latestTotal,
                showSizeChanger: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                onChange: (page, size) => {
                  setLatestPageNumber(page);
                  setLatestPageSize(size);
                },
              }}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};


export default DefaultDashboard;
