import React, { useEffect, useMemo, useState } from "react";
import { Row, Col, Button, Avatar, Dropdown, Table, Tag, Select, message } from "antd";
import ChartWidget from "components/shared-components/ChartWidget";
import GoalWidget from "components/shared-components/GoalWidget";
import Card from "components/shared-components/Card";
import Flex from "components/shared-components/Flex";
import { 
  VisitorChartData, 
  RecentTransactionData 
} from "./DefaultDashboardData";
import StatisticsService from "services/StattisticsService";
import RevenueBarChart from "./components/RevenueBarChart";
import SalesBarChart from "./components/SalesBarChart";
import CostsBarChart from "./components/CostsBarChart";
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

const HERO_CHART_HEIGHT = "680px";
const SECONDARY_VISITOR_CHART_HEIGHT = "340px";
const SIDE_CARD_MIN_HEIGHT = 210;
const KPI_CARD_MIN_HEIGHT = 340;
const DEFAULT_AXIS = "MONTH";

const latestTransactionOption = [
  {
    key: "Refresh",
    label: (
      <Flex alignItems="center" gap={SPACER[2]}>
        <ReloadOutlined />
        <span className="ml-2">Refresh</span>
      </Flex>
    ),
  },
  {
    key: "Print",
    label: (
      <Flex alignItems="center" gap={SPACER[2]}>
        <PrinterOutlined />
        <span className="ml-2">Print</span>
      </Flex>
    ),
  },
  {
    key: "Export",
    label: (
      <Flex alignItems="center" gap={SPACER[2]}>
        <FileExcelOutlined />
        <span className="ml-2">Export</span>
      </Flex>
    ),
  },
];

const CardDropdown = ({items}) => {

  return (
    <Dropdown menu={{items}} trigger={["click"]} placement="bottomRight">
      <a href="/#" className="text-gray font-size-lg" onClick={e => e.preventDefault()}>
        <EllipsisOutlined />
      </a>
    </Dropdown>
  );
};

const tableColumns = [
  {
    title: "Customer",
    dataIndex: "name",
    key: "name",
    render: (text, record) => (
      <div className="d-flex align-items-center">
        <Avatar size={30} className="font-size-sm" style={{backgroundColor: record.avatarColor}}>
          {utils.getNameInitial(text)}
        </Avatar>
        <span className="ml-2">{text}</span>
      </div>
    ),
  },
  {
    title: "Date",
    dataIndex: "date",
    key: "date",
  },
  {
    title: "Amount",
    dataIndex: "amount",
    key: "amount",
  },
  {
    title: () => <div className="text-right">Status</div>,
    key: "status",
    render: (_, record) => (
      <div className="text-right">
        <Tag className="mr-0" color={record.status === "Approved" ? "cyan" : record.status === "Pending" ? "blue" : "volcano"}>{record.status}</Tag>
      </div>
    ),
  },
];

export const DefaultDashboard = () => {
  const { t, i18n } = useTranslation();
  const [visitorChartData] = useState(VisitorChartData);
  const [recentTransactionData] = useState(RecentTransactionData);
  const [axis, setAxis] = useState(DEFAULT_AXIS);
  const [heroRows, setHeroRows] = useState([]);
  const [heroLoading, setHeroLoading] = useState(false);
  const { direction } = useSelector(state => state.theme);

  const axisOptions = [
    { value: "MONTH", label: t("dashboard_axis_month") },
    { value: "YEAR", label: t("dashboard_axis_year") },
  ];

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

  return (
    <>  
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={16}>
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
        <Col xs={24} sm={24} md={24} lg={8}>
          <GoalWidget
            title="Monthly Target"
            value={87}
            size={140}
            subtitle="You need abit more effort to hit monthly target"
            extra={<Button type="primary">Learn More</Button>}
            cardStyle={{ minHeight: SIDE_CARD_MIN_HEIGHT }}
            cardBodyStyle={{ padding: "12px" }}
          />
          <RevenueBarChart
            cardMinHeight={KPI_CARD_MIN_HEIGHT}
            height={320}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={8}>
          <SalesBarChart cardMinHeight={KPI_CARD_MIN_HEIGHT} />
        </Col>
        <Col xs={24} sm={24} md={24} lg={8}>
          <CostsBarChart cardMinHeight={KPI_CARD_MIN_HEIGHT} />
        </Col>
        <Col xs={24} sm={24} md={24} lg={8}>
          <ChartWidget
            title="Unique Visitors"
            series={visitorChartData.series}
            xAxis={visitorChartData.categories}
            height={SECONDARY_VISITOR_CHART_HEIGHT}
            direction={direction}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={24}>
          <Card title="Latest Transactions" extra={<CardDropdown items={latestTransactionOption} />}>
            <Table 
              className="no-border-last" 
              columns={tableColumns} 
              dataSource={recentTransactionData} 
              rowKey='id' 
              pagination={false}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
};


export default DefaultDashboard;
