import React, { useState, useEffect, useCallback } from "react";
import { Table } from "antd";
import {
  EyeOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import RelativeService from "services/RelativeService";
import RegistrationService from "services/RegistrationService";
import { useTranslation } from "react-i18next";
import { getDateDayString } from "utils/aditionalFunctions";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import { useGuardedNavigate } from "utils/hooks/useUnsavedChangesGuard";
const RelativeTable = ({
  id,
  redirect,
  model,
  formType,
  regNumber,
  relativeData,
}) => {
  const { t } = useTranslation();
  const navigate = useGuardedNavigate();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState({
    items: [],
    loading: true,
    pageNumber: 1,
    pageSize: 10,
    total: 0,
  });
  const [sortedColumns, setSortedColumns] = useState([]);

  const fetchData = useCallback(async () => {
    try {
      setData((prev) => ({ ...prev, loading: true }));
      const sort = sortedColumns.length > 0
        ? sortedColumns.map(s => ({ [s.field]: s.order.toLowerCase() }))
        : undefined;
      let response;
      if (formType === "4") {
        response = await RegistrationService.getList(
          data.pageNumber,
          data.pageSize,
          "registration4",
          { regNumber },
          sort ? { sort } : undefined
        );
      } else {
        response = await RelativeService.list_by_registrationId(
          data.pageNumber,
          data.pageSize,
          id,
          model,
          { params: { id, model }, ...(sort ? { sort } : {}) }
        );
      }
      setData({
        items: response?.data?.relatives || response?.data?.registrations || [],
        loading: false,
        pageNumber: data.pageNumber,
        pageSize: data.pageSize,
        total:
          response?.data?.total_relatives ||
          response?.data?.total_registrations ||
          0,
      });
    } catch (error) {
      setData({
        items: [],
        loading: false,
        pageNumber: 1,
        pageSize: 10,
        total: 0,
      });
    }
  }, [id, model, formType, regNumber, data.pageNumber, data.pageSize, sortedColumns]);

  useEffect(() => {
    if (model === "registration4") {
      fetchData();
    } else {
      setData({
        items: relativeData,
        loading: false,
        pageNumber: 1,
        pageSize: 10,
        total: relativeData?.length || 0,
      });
    }
  }, [fetchData, relativeData, model]);

  const viewDetails = (row) => {
    if (row?.model !== "registration4") {
      navigate(
        `/app/apps/relative/info-relative/${
          row?.id
        }?redirect=/app/apps/register/info-register/${id}&&search=${searchParams.get(
          "search"
        )}${redirect ? `&&oldRedirect=${redirect}` : ""}`
      );
    } else {
      navigate(
        `/app/apps/register/info-register/${
          row?.id
        }?redirect=/app/apps/register/info-register/${id}&&search=${searchParams.get(
          "search"
        )}${redirect ? `&&oldRedirect=${redirect}` : ""}`
      );
    }
  };

  const dropdownMenu = (row) => ({
    items: [
      // {
      //   key: 'add-card',
      //   label: (
      //     <Flex alignItems="center">
      //       <PlusCircleOutlined />
      //       <span className="ml-2">{t("add_card")}</span>
      //       {selectedRowKeys.length > 0 && (
      //         <span className="ml-2">({selectedRowKeys.length})</span>
      //       )}
      //     </Flex>
      //   ),
      //   onClick: () => addCard(row)
      // },
      {
        key: "view-details",
        label: (
          <Flex alignItems="center">
            <EyeOutlined />
            <span className="ml-2">{t("view_details")}</span>
          </Flex>
        ),
        onClick: () => viewDetails(row)
      }
    ]
   });

  const handleTableChange = (pagination, filters, sorter) => {
    const sorters = Array.isArray(sorter) ? sorter : [sorter];
    const newSorted = sorters
      .filter(s => s.order)
      .map(s => ({ field: s.field, order: s.order === 'ascend' ? 'ASC' : 'DESC' }));
    setSortedColumns(newSorted);
  };

  const columns = [
    {
      title: t("№"),
      dataIndex: "number",
      render: (text, record, index) => (
        <span>{(data.pageNumber - 1) * data.pageSize + index + 1}</span>
      ),
    },
    {
      title: <UnorderedListOutlined />,
      dataIndex: "actions",
      render: (_, elm) => (
        <div className="text-right">
          <EllipsisDropdown menu={dropdownMenu(elm)} />
        </div>
      ),
    },
    ...(model !== "registration4"
      ? [
          {
            title: t("relation_degree"),
            dataIndex: "relationDegree",
            key: "relation_degree",
            sorter: { multiple: 1 },
            sortDirections: ["ascend", "descend"],
            sortOrder: (() => { const f = sortedColumns.find(s => s.field === "relationDegree"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
            render: (text) =>
              text?.length > 30 ? text.slice(0, 30) + "..." : text,
          },
        ]
      : []),
    {
      title: t("last_name"),
      dataIndex: "lastName",
      key: "last_name",
      sorter: { multiple: 2 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "lastName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("first_name"),
      dataIndex: "firstName",
      key: "first_name",
      sorter: { multiple: 3 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "firstName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("father_name"),
      dataIndex: "fatherName",
      key: "fatherName",
      sorter: { multiple: 4 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "fatherName"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      key: "birthDate",
      sorter: { multiple: 5 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "birthDate"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (birthDate, elm) => {
        const birthDateString = birthDate
          ? getDateDayString(birthDate)
          : elm?.birthYear
          ? elm?.birthYear
          : "";
        return birthDateString;
      },
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      key: "birthPlace",
      sorter: { multiple: 6 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "birthPlace"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      key: "residence",
      sorter: { multiple: 7 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "residence"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) =>
        text?.length > 100 ? text.slice(0, 100) + "..." : text,
    },
    {
      title: t("workplace"),
      dataIndex: "workplace",
      key: "workplace",
      sorter: { multiple: 8 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "workplace"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text, elm) =>
        elm?.workplace
          ? elm?.workplace + (elm?.position ? " - " + elm?.position : "")
          : elm?.position || "",
    },
    {
      title: t("notes"),
      dataIndex: "notes",
      key: "notes",
      sorter: { multiple: 9 },
      sortDirections: ["ascend", "descend"],
      sortOrder: (() => { const f = sortedColumns.find(s => s.field === "notes"); return f ? (f.order === "ASC" ? "ascend" : "descend") : null; })(),
      render: (text) => (text?.length > 10 ? text.slice(0, 10) + "..." : text),
    }
  ];

  return (
    <Table
      dataSource={data.items}
      columns={columns}
      loading={data.loading}
      onChange={handleTableChange}
      pagination={{
        current: data.pageNumber,
        pageSize: data.pageSize,
        total: data.total,
        showSizeChanger: true,
        pageSizeOptions: ["10", "20", "50"],
        onChange: (page, pageSize) =>
          setData((prev) => ({ ...prev, pageNumber: page, pageSize })),
      }}
    />
  );
};

export default RelativeTable;
