import React, { useState, useCallback } from "react";
import { Card, Table, Input, Button, message, Col, Row, Pagination } from "antd";
import {
  SearchOutlined,
  LeftCircleOutlined,
} from "@ant-design/icons";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import { useEffect } from "react";
import Service from "services/Service";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const ServiceList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await Service.getServiceList(pageNumber, pageSize, search);
      setList(res?.data?.services);
      setTotal(res?.data?.total_services)
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const tableColumns = [
    {
      title: t("name"),
      dataIndex: "name",
      width: "30%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "name"),
    },
    {
      title: t("description"),
      dataIndex: "description",
      width: "40%",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "description"),
    },
    {
      title: t("updated_at"),
      width: "15%",
      dataIndex: "updatedAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "updatedAt"),
    },
    {
      title: t("created_at"),
      width: "15%",
      dataIndex: "createdAt",
      // sorter: (a, b) => utils.antdTableSorter(a, b, "createdAt"),
    },
    // {
    // 	title: 'Actions',
    // 	dataIndex: 'actions',
    // 	render: (_, elm) => (
    // 		<div className="text-right">
    // 			<EllipsisDropdown menu={dropdownMenu(elm)} />
    // 		</div>
    // 	)
    // }
  ];



  const onSearch = (e) => {
    setPageNumber(1);
    setSearch(e.currentTarget.value);
  };


  const backHandle = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return (
    <Card>
      <Flex
        alignItems="center"
        justifyContent="space-between"
        mobileFlex={false}
      >
        <Flex className="mb-1" mobileFlex={false}>
          <div className="mr-md-3 mb-3">
            <Input
              placeholder={t("search")}
              autoFocus
              prefix={<SearchOutlined />}
              onChange={(e) => onSearch(e)}
            />
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="mb-3">
            <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
          </div>
        </Flex>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map((elm) => ({
            ...elm,
            createdAt: getDateString(elm?.createdAt),
            updatedAt: getDateString(elm?.updatedAt),
          }))}
          rowKey="id"
          loading={loading}
          // rowSelection={{
          //   selectedRowKeys: selectedRowKeys,
          //   type: "checkbox",
          //   preserveSelectedRowKeys: false,
          //   ...rowSelection,
          // }}
          pagination={false}
        />
        <Row
          style={{
            marginTop: 16,
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Col>
            <span style={{ fontWeight: "bold" }}>
              {t("total_number_of_entries")}: {total}
            </span>
          </Col>
          <Col>
            <Pagination
              current={pageNumber}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={["10", "20", "50", "100"]}
              onShowSizeChange={(current, size) => {
                setPageSize(size);
                setPageNumber(1);
              }}
              onChange={(page, pageSize) => {
                setPageNumber(page);
              }}
            />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default ServiceList;
