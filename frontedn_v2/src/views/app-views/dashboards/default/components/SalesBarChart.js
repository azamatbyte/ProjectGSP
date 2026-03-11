import React, { useEffect, useState, useMemo } from "react";
import ApexChart from "react-apexcharts";
import Card from "components/shared-components/Card";
import { Button, InputNumber, Spin, Tooltip, message } from "antd";
import { FileExcelOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import StatisticsService from "services/StattisticsService";

const COLORS = [
  "#5b9bd5",
  "#ed7d31",
  "#a5a5a5",
  "#f4c430",
  "#70ad47",
  "#4472c4",
  "#ff6384",
  "#36a2eb",
  "#cc65fe",
  "#ffce56",
];

const SalesBarChart = ({
  cardMinHeight = 430,
  height = 320,
  model = "registration",
  chartId,
  onExport,
  exporting = false,
}) => {
  const { t } = useTranslation();
  const [years, setYears] = useState(5);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      setLoading(true);
      try {
        const response = await StatisticsService.topOtk1Workplaces({ year: years, model });
        if (cancelled) return;
        const result = Array.isArray(response?.data?.data) ? response.data.data : [];
        setData(result);
      } catch (error) {
        if (!cancelled) {
          setData([]);
          message.error(t("dashboard_otk1_loading_error"));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [years, model, t]);

  const categories = useMemo(() => data.map((item) => String(item?.year || "")), [data]);

  const allWorkplaces = useMemo(() => {
    const set = new Set();
    data.forEach((item) => {
      (item?.top || []).forEach((entry) => {
        if (entry?.workplace) set.add(entry.workplace);
      });
    });
    return Array.from(set);
  }, [data]);

  const series = useMemo(() => {
    return allWorkplaces.map((workplace) => ({
      name: workplace,
      data: data.map((item) => {
        const found = (item?.top || []).find((e) => e?.workplace === workplace);
        return found ? found.count : 0;
      }),
    }));
  }, [data, allWorkplaces]);

  const options = useMemo(() => ({
    chart: {
      id: chartId,
      toolbar: {
        show: false,
      },
    },
    plotOptions: {
      bar: {
        horizontal: false,
        columnWidth: "55%",
        borderRadius: 2,
      },
    },
    colors: COLORS.slice(0, allWorkplaces.length || 1),
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 2,
      colors: ["transparent"],
    },
    xaxis: {
      categories,
    },
    yaxis: {
      title: {
        text: "ОТКАЗ-1",
      },
      decimalsInFloat: 0,
    },
    fill: {
      opacity: 1,
    },
    tooltip: {
      y: {
        formatter: (val) => `${val}`,
      },
    },
    legend: {
      position: "bottom",
      horizontalAlign: "center",
      itemMargin: { vertical: 4, horizontal: 8 },
    },
    responsive: [
      {
        breakpoint: 992,
        options: {
          legend: {
            position: "bottom",
          },
        },
      },
      {
        breakpoint: 576,
        options: {
          plotOptions: {
            bar: {
              columnWidth: "70%",
            },
          },
        },
      },
    ],
  }), [categories, allWorkplaces, chartId]);

  return (
    <Card
      title={model === "registration4" ? t("dashboard_otk1_forms_title") : t("dashboard_otk1_title")}
      style={{ minHeight: cardMinHeight }}
      bodyStyle={{ padding: "12px 12px 8px" }}
      extra={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <InputNumber
            min={1}
            max={10}
            value={years}
            onChange={(val) => {
              if (val && val >= 1 && val <= 10) setYears(val);
            }}
            size="small"
            style={{ width: 70 }}
            addonAfter={t("dashboard_otk1_years_label")}
            disabled={loading || exporting}
          />
          <Tooltip title={t("export")}>
            <Button
              size="small"
              icon={<FileExcelOutlined />}
              onClick={() => onExport?.({ years, model })}
              loading={exporting}
              disabled={loading || exporting}
            />
          </Tooltip>
        </div>
      }
    >
      <Spin spinning={loading}>
        <ApexChart
          options={options}
          series={series.length > 0 ? series : [{ name: "-", data: [] }]}
          width="100%"
          height={height}
          type="bar"
        />
      </Spin>
    </Card>
  );
};

export default SalesBarChart;
