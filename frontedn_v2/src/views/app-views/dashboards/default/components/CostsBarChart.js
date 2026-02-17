import React, { Component } from "react";
import ApexChart from "react-apexcharts";
import Card from "components/shared-components/Card";
import { COLOR_1, COLOR_2, COLOR_4 } from "constants/ChartConstant";

class CostsBarChart extends Component {
  render() {
    const {
      title = "Costs",
      height = 320,
      cardMinHeight = 430,
      cardBodyStyle = { padding: "12px 12px 8px" },
      categories = ["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      series = [
        { name: "Operational Cost", data: [22, 28, 34, 39, 42, 46, 51, 55, 60] },
        { name: "Marketing Cost", data: [14, 18, 16, 21, 24, 22, 27, 29, 31] },
        { name: "Other Cost", data: [8, 9, 11, 10, 12, 13, 14, 15, 16] },
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

export default CostsBarChart;
