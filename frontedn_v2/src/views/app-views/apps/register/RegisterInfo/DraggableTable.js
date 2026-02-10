import { Button, Pagination } from "antd";
import React, { useState, useEffect } from "react";
import {
  CheckCircleOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import RelativeService from "services/RelativeService";
import { useTranslation } from "react-i18next";
import { getDateDayString } from "utils/aditionalFunctions";
import createSession, { SESSION_TYPES } from "utils/sessions";



const DraggableTable = ({ id, redirect, model }) => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await RelativeService.list_by_registrationId(
          pageNumber,
          pageSize,
          id,
          model
        );
        setItems(
          response?.data?.relatives.map((relative, index) => ({
            ...relative,
            key: index + 1,
          }))
        );
        setTotal(response?.data?.total_relatives);
      } catch (error) {
        setItems([]);
        setTotal(0);
      }
    };
    fetchData();
  }, [id, pageNumber, pageSize, model, items]);

  const [draggedItem, setDraggedItem] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedItem(items[index]);
    e.target.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = "1";
    setDraggedItem(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, index) => {
    e.preventDefault();

    const newItems = [...items];
    const draggedIndex = items.findIndex(
      (item) => item.key === draggedItem.key
    );

    newItems.splice(draggedIndex, 1);
    newItems.splice(index, 0, draggedItem);

    setItems(newItems);
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table className="my-table w-full border-collapse rounded-lg overflow-hidden">
        <thead className="bg-gray-700">
          <tr>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("drag")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("first_name")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("last_name")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("father_name")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("relation_degree")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("birth_date")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("birth_place")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("residence")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("workplace")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("note")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("actions")}
            </th>
            <th className="p-3 text-left font-medium text-gray-200">
              {t("add_card")}
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={item.key}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnd={handleDragEnd}
              className="border-t border-gray-600 hover:bg-gray-800 cursor-move"
            >
              <td
                className="p-2"
                style={{ cursor: "move" }}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
              >
                <svg
                  width="2em"
                  height="2em"
                  viewBox="0 0 16 16"
                  className="inline-block align-middle"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect
                    width="4"
                    height="4"
                    x="6"
                    y="6"
                    fill="currentColor"
                    rx="1"
                  ></rect>
                  <rect
                    width="4"
                    height="4"
                    x="10"
                    y="6"
                    fill="currentColor"
                    rx="1"
                  ></rect>
                  <rect
                    width="4"
                    height="4"
                    x="6"
                    y="10"
                    fill="currentColor"
                    rx="1"
                  ></rect>
                  <rect
                    width="4"
                    height="4"
                    x="10"
                    y="10"
                    fill="currentColor"
                    rx="1"
                  ></rect>
                </svg>
              </td>
              <td className="p-2">{item?.firstName}</td>
              <td className="p-2">{item?.lastName}</td>
              <td className="p-2">{item?.fatherName}</td>
              <td className="p-2">{item?.relationDegree}</td>
              <td className="p-2">
                {item?.birthDate
                  ? getDateDayString(item?.birthDate)
                  : item?.birthYear
                  ? item?.birthYear
                  : ""}
              </td>
              <td className="p-2">
                {item?.birthPlace?.length > 50
                  ? item?.birthPlace?.slice(0, 50) + "..."
                  : item?.birthPlace}
              </td>
              <td className="p-2">
                {item?.residence?.length > 50
                  ? item?.residence?.slice(0, 50) + "..."
                  : item?.residence}
              </td>
              <td className="p-2">
                {item?.workplace
                  ? item?.workplace + " " + item?.position
                  : item?.position
                  ? item?.position
                  : "-"}
              </td>
              <td className="p-2">
                {item?.notes?.length > 50
                  ? item?.notes?.slice(0, 50) + "..."
                  : item?.notes}
              </td>
              <td className="p-2">
                <Button
                  type="danger"
                  size="small"
                  onClick={() => {
                    redirect
                      ? navigate(
                          `/app/apps/relative/info-relative/${
                            item?.id
                          }?redirect=/app/apps/register/info-register/${id}&&search=${searchParams.get(
                            "search"
                          )}&&oldRedirect=${redirect}`
                        )
                      : navigate(
                          `/app/apps/relative/info-relative/${
                            item?.id
                          }?redirect=/app/apps/register/info-register/${id}&&search=${searchParams.get(
                            "search"
                          )}`
                        );
                  }}
                  icon={<EyeOutlined />}
                >
                  {t("open")}
                </Button>
              </td>
              <td className="p-3">
                <Button
                  type="danger"
                  size="small"
                  onClick={() => {
                    createSession(item?.id,SESSION_TYPES.SESSION);
                  }}
                  icon={<CheckCircleOutlined />}
                >
                  {t("add_card")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination
        className="mt-4 text-right"
        current={pageNumber}
        pageSize={pageSize}
        total={total}
        showSizeChanger={true}
        pageSizeOptions={[10, 20, 30, 40, 50]}
        onChange={(page, pageSize) => {
          setPageNumber(page);
          setPageSize(pageSize);
        }}
      />
    </div>
  );
};

export default DraggableTable;
