import React, { Component } from "react";
import ApexChart from "react-apexcharts";
import Card from "components/shared-components/Card";
import { COLOR_1, COLOR_2, COLOR_4 } from "constants/ChartConstant";

class SalesBarChart extends Component {
  render() {
    const {
      title = "Sales",
      height = 300,
      cardMinHeight = 430,
      categories = ["Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"],
      series = [
        { name: "Domestic Sales", data: [30, 42, 55, 47, 62, 59, 70, 65, 74] },
        { name: "International Sales", data: [18, 25, 33, 38, 41, 49, 53, 58, 63] },
        { name: "Returns", data: [6, 8, 7, 9, 8, 7, 10, 9, 8] },
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
      <Card title={title} style={{ minHeight: cardMinHeight }}>
        <ApexChart options={options} series={series} width="100%" height={height} type="bar" />
      </Card>
    );
  }
}

export default SalesBarChart;
