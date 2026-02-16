import React, { useState } from "react";
import { Row, Col, Button, Avatar, Dropdown, Table,  Tag } from "antd";
import ChartWidget from "components/shared-components/ChartWidget";
import GoalWidget from "components/shared-components/GoalWidget";
import Card from "components/shared-components/Card";
import Flex from "components/shared-components/Flex";
import { 
  VisitorChartData, 
  RecentTransactionData 
} from "./DefaultDashboardData";
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

const TOP_CARD_MIN_HEIGHT = 430;

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
  const [visitorChartData] = useState(VisitorChartData);
  const [recentTransactionData] = useState(RecentTransactionData);
  const { direction } = useSelector(state => state.theme);

  return (
    <>  
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={18}>
          <Row gutter={16}>
            <Col xs={24} sm={24} md={24} lg={24} xl={8}>
              <RevenueBarChart cardMinHeight={TOP_CARD_MIN_HEIGHT} />
            </Col>
            <Col xs={24} sm={24} md={24} lg={24} xl={8}>
              <SalesBarChart cardMinHeight={TOP_CARD_MIN_HEIGHT} />
            </Col>
            <Col xs={24} sm={24} md={24} lg={24} xl={8}>
              <CostsBarChart cardMinHeight={TOP_CARD_MIN_HEIGHT} />
            </Col>
          </Row>
        </Col>
        <Col xs={24} sm={24} md={24} lg={6}>
          <GoalWidget 
            title="Monthly Target" 
            value={87}
            subtitle="You need abit more effort to hit monthly target"
            extra={<Button type="primary">Learn More</Button>}
            cardStyle={{ minHeight: TOP_CARD_MIN_HEIGHT }}
          />
        </Col>
      </Row>
      <Row gutter={16}>
        <Col xs={24} sm={24} md={24} lg={12}>
          <ChartWidget
            title="Unique Visitors"
            series={visitorChartData.series}
            xAxis={visitorChartData.categories}
            height={"400px"}
            direction={direction}
          />
        </Col>
        <Col xs={24} sm={24} md={24} lg={12}>
          <ChartWidget
            title="Unique Visitors"
            series={visitorChartData.series}
            xAxis={visitorChartData.categories}
            height={"400px"}
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
