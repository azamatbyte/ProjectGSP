import React, { useCallback, useEffect, useState } from "react";
import { Card, Table, Input, Button, message, Col, Row, Pagination } from "antd";
import { SearchOutlined, EditOutlined, LeftCircleOutlined, UnorderedListOutlined } from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import ConclusionService from "services/ConclusionService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";
import { Tooltip } from "antd";

const ConclusionList = () => {
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
      const res = await ConclusionService.getList(pageNumber, pageSize, search);
      setList(res?.data?.conclusions || []);
      setTotal(res?.data?.total_conclusions || 0);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("no_data"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, t]);

  useEffect(() => { fetchData(); }, [pageNumber, pageSize, search, fetchData]);

  const dropdownMenu = (row) => ({
    items: [
      {
        key: "edit",
        label: (
          <Flex alignItems="center">
            <EditOutlined />
            <span className="ml-2">{t("edit")}</span>
          </Flex>
        ),
        onClick: () => editConclusion(row)
      }
    ]
  });

  // addConclusion removed — UI currently hides the add button
  const editConclusion = (row) => navigate(`/app/apps/conclusion/edit-conclusion/${row.id}`);
  const backHandle = () => navigate(-1);

  const tableColumns = [
    { title: <UnorderedListOutlined />, dataIndex: "actions", width: 50, render: (_, elm) => <div className="text-right"><EllipsisDropdown menu={dropdownMenu(elm)} /></div> },
    // { title: t("name"), dataIndex: "name" },
    { title: t("main_title"), dataIndex: "title" },
    {
      title: t("to_who"), dataIndex: "to_who", render: (to_who) => (
        <Tooltip title={to_who}>
          <span style={{
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          >
            {to_who ? (
              to_who?.length > 50 ? (
                to_who?.slice(0, 50) + "..."
              ) : (
                to_who
              )
            ) : (
              <></>
            )}
          </span>
        </Tooltip>
      ),
    },
    { title: t("to_position"), dataIndex: "to_position" },
    { title: t("file_name"), dataIndex: "tittle_center" },
    { title: t("executor"), dataIndex: "executor" },
    { title: t("boss"), dataIndex: "boss" },
    { title: t("created_at"), dataIndex: "createdAt" },
    { title: t("updated_at"), dataIndex: "updatedAt" },
  ];

  const onSearch = (e) => { setPageNumber(1); setSearch(e.target.value); };

  return (
    <Card>
      <Flex alignItems="center" justifyContent="space-between" mobileFlex={false}>
        <Flex className="mb-1" mobileFlex={false}>
          <div className="mr-md-3 mb-3">
            <Input placeholder={t("search")} prefix={<SearchOutlined />} onChange={onSearch} />
          </div>
        </Flex>
        <div className="mb-3 d-flex gap-2">
          {/* <Button onClick={addConclusion} type="primary" icon={<PlusCircleOutlined />} block>{t("add")}</Button> */}
          <Button className="ml-2" onClick={backHandle}><LeftCircleOutlined />{t("back")}</Button>
        </div>
      </Flex>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={list.map(elm => ({ ...elm, createdAt: getDateString(elm?.createdAt), updatedAt: getDateString(elm?.updatedAt) }))}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
        <Row style={{ marginTop: 16, justifyContent: "space-between", alignItems: "center" }}>
          <Col><span style={{ fontWeight: "bold" }}>{t("total_number_of_entries")}: {total}</span></Col>
          <Col>
            <Pagination current={pageNumber} pageSize={pageSize} total={total} showSizeChanger pageSizeOptions={["10", "20", "50", "100"]}
              onShowSizeChange={(current, size) => { setPageSize(size); setPageNumber(1); }}
              onChange={(page) => { setPageNumber(page); }} />
          </Col>
        </Row>
      </div>
    </Card>
  );
};

export default ConclusionList;
