import React, { Component } from "react";
import ApexChart from "react-apexcharts";
import Card from "components/shared-components/Card";
import { COLOR_1, COLOR_2, COLOR_4 } from "constants/ChartConstant";

class RevenueBarChart extends Component {
  render() {
    const {
      title = "Revenue",
      height = 320,
      cardMinHeight = 430,
      cardBodyStyle = { padding: "12px 12px 8px" },
      categories = ["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      series = [
        { name: "Net Profit", data: [44, 55, 57, 56, 61, 58, 63, 60, 66] },
        { name: "Revenue", data: [76, 85, 101, 98, 87, 105, 91, 114, 94] },
        { name: "Free Cash Flow", data: [35, 41, 36, 26, 45, 48, 52, 53, 41] },
      ],
    } = this.props;

    const options = {
      plotOptions: {
        bar: {
          horizontal: false,
          columnWidth: "55%",
          endingShape: "rounded",
        },
      },
      colors: [COLOR_1, COLOR_2, COLOR_4],
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
      fill: {
        opacity: 1,
      },
      tooltip: {
        y: {
          formatter: (val) => `$${val} thousands`,
        },
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
    };

    return (
      <Card title={title} style={{ minHeight: cardMinHeight }} bodyStyle={cardBodyStyle}>
        <ApexChart options={options} series={series} width="100%" height={height} type="bar" />
      </Card>
    );
  }
}

export default RevenueBarChart;
