import React, { useState, useCallback, useEffect, useMemo } from "react";
import { Card, Table, Input, Button, message, Col, Row, Pagination } from "antd";
import {
  EyeOutlined,
  DeleteOutlined,
  SearchOutlined,
  PlusCircleOutlined,
  EditOutlined,
  LeftCircleOutlined,
  UnorderedListOutlined,
} from "@ant-design/icons";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useNavigate } from "react-router-dom";
// ...existing code...
import RelationService from "services/RelationlaceService";
import { getDateString } from "utils/aditionalFunctions";
import { useTranslation } from "react-i18next";

const RelationList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortedColumns, setSortedColumns] = useState([]);

  const handleTableChange = useCallback((pagination, filters, sorter) => {
    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const newSorted = sorters
      .filter(s => s.order)
      .map(s => ({ field: s.columnKey || s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
    setSortedColumns(newSorted);
    setPageNumber(1);
  }, []);

  const sortOrderMap = useMemo(() => {
    const map = {};
    sortedColumns.forEach((s) => {
      map[s.field] = s.order === 'ASC' ? 'ascend' : 'descend';
    });
    return map;
  }, [sortedColumns]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await RelationService.getRelationList(
        pageNumber,
        pageSize,
        search,
        sortedColumns
      );
      setList(res?.data?.relationDegrees);
      setTotal(res?.data?.total_relation_degrees);
    } catch (error) {
      setList([]);
      setTotal(0);
      message.error(t("data_not_found"));
    } finally {
      setLoading(false);
    }
  }, [pageNumber, pageSize, search, sortedColumns, t]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);

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
        onClick: () => editRelation(row)
      },
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row)
      },
      {
        key: "delete",
        label: (
          <Flex alignItems="center">
            <DeleteOutlined />
            <span className="ml-2">
              {t("delete")}
            </span>
          </Flex>
        ),
        onClick: () => deleteRow(row)
      }
    ]
  });

  const addRelation = () => {
    navigate("/app/apps/relation/add-relation");
  };

  const viewDetails = (row) => {
    navigate(`/app/apps/relation/info-relation/${row.id}`);
  };

  const editRelation = (row) => {
    navigate(`/app/apps/relation/edit-relation/${row.id}`);
  };

  const deleteRow = async (row) => {
    try {
      await RelationService.deleteById(row?.id);
      fetchData();
      message.success(t("relation_deleted_successfully"));
    } catch (error) {
      message.error(t("error_deleting_relation"));
    }
  };

  const backHandle = () => {
    navigate(-1);
  };

  const tableColumns = [
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      width: "50px",
      render: (_, elm) => (
        <div className="text-right">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
    {
      title: t("name"),
      dataIndex: "name",
      key: "name",
      width: "70%",
      sorter: { multiple: 1 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['name'] || null,
    },
    {
      title: t("updated_at"),
      dataIndex: "updatedAt",
      key: "updatedAt",
      sorter: { multiple: 2 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['updatedAt'] || null,
    },
    {
      title: t("created_at"),
      dataIndex: "createdAt",
      key: "createdAt",
      sorter: { multiple: 3 },
      sortDirections: ['ascend', 'descend'],
      sortOrder: sortOrderMap['createdAt'] || null,
    }
  ];

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
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Flex>
        <Flex className="mb-1">
          <div className="mb-3 d-flex gap-2">
            <Button
              onClick={addRelation}
              type="primary"
              icon={<PlusCircleOutlined />}
              block
            >
              {t("add")}
            </Button>
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
          onChange={handleTableChange}
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

export default RelationList;
