import React, { useState, useEffect, useCallback } from "react";
import { Table } from "antd";
import {
  EyeOutlined,
  UnorderedListOutlined,
  PlusCircleOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import RelativeService from "services/RelativeService";
import RegistrationService from "services/RegistrationService";
import { useTranslation } from "react-i18next";
import { getDateDayString } from "utils/aditionalFunctions";
import EllipsisDropdown from "components/shared-components/EllipsisDropdown";
import Flex from "components/shared-components/Flex";
import Utils from "utils";
import SessionService from "services/SessionService";
import { SESSION_TYPES } from "utils/sessions";

const RelativeTable = ({
  id,
  redirect,
  model,
  formType,
  regNumber,
  selectedRowKeys,
  setSelectedRowKeys,
}) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [data, setData] = useState({
    items: [],
    loading: true,
    pageNumber: 1,
    pageSize: 10,
    total: 0,
  });
  
  const navigate = useNavigate();

  const fetchData = useCallback(async () => {
    try {
      setData((prev) => ({ ...prev, loading: true }));
      const service =
        formType === "4"
          ? RegistrationService.getList
          : RelativeService.list_by_registrationId;
      const params =
        formType === "4" ? { model: "registration4", regNumber } : id;
      const response = await service(
        data.pageNumber,
        data.pageSize,
        params,
        model
      );
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
  }, [id, model, formType, regNumber, data.pageNumber, data.pageSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const addCard = (row) => {
    if (selectedRowKeys.length > 0) {
      selectedRowKeys.forEach((key) => {
        SessionService.create(key,SESSION_TYPES.SESSION);
      });
      setSelectedRowKeys([]);
    } else {
      SessionService.create(row?.id,SESSION_TYPES.SESSION);
    }
  };

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
      {
        key: "add-card",
        label: (
          <Flex alignItems="center">
            <PlusCircleOutlined />
            <span className="ml-2">{t("add_card")}</span>
            {selectedRowKeys.length > 0 && (
              <span className="ml-2">({selectedRowKeys.length})</span>
            )}
          </Flex>
        ),
        onClick: () => addCard(row)
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
      }
    ]
   });

  const columns = [
    ...(formType !== "4"
      ? [
          {
            title: t("relation_degree"),
            dataIndex: "relationDegree",
            key: "relation_degree",
            sorter: (a, b) => Utils.antdTableSorter(a, b, "relationDegree"),
            render: (text) =>
              text?.length > 30 ? text.slice(0, 30) + "..." : text,
          },
        ]
      : []),
    {
      title: t("last_name"),
      dataIndex: "lastName",
      key: "last_name",
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("first_name"),
      dataIndex: "firstName",
      key: "first_name",
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("father_name"),
      dataIndex: "fatherName",
      key: "fatherName",
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("birth_date"),
      dataIndex: "birthDate",
      key: "birthDate",
      render: (text, elm) =>
        elm?.birthDate ? getDateDayString(elm.birthDate) : elm?.birthYear || "",
    },
    {
      title: t("birth_place"),
      dataIndex: "birthPlace",
      key: "birthPlace",
      render: (text) => (text?.length > 30 ? text.slice(0, 30) + "..." : text),
    },
    {
      title: t("residence"),
      dataIndex: "residence",
      key: "residence",
      render: (text) =>
        text?.length > 100 ? text.slice(0, 100) + "..." : text,
    },
    {
      title: t("workplace"),
      dataIndex: "workplace",
      key: "workplace",
      render: (text, elm) =>
        elm?.workplace
          ? elm?.workplace + (elm?.position ? " - " + elm?.position : "")
          : elm?.position || "",
    },
    {
      title: t("notes"),
      dataIndex: "notes",
      key: "notes",
      render: (text) => (text?.length > 10 ? text.slice(0, 10) + "..." : text),
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
  ];

  return (
    <Table
      dataSource={data.items}
      columns={columns}
      rowKey="id"
      rowSelection={{
        selectedRowKeys,
        type: "checkbox",
        preserveSelectedRowKeys: false,
        onChange: setSelectedRowKeys,
      }}
      loading={data.loading}
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