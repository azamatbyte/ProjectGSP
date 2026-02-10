import React, { useEffect, useReducer } from "react";
import { Table, Card, message } from "antd";
import dayjs from "dayjs";
import AuthService from "services/AuthService";
import { getDateString } from "utils/aditionalFunctions";

const initialState = {
  services: [],
  loading: true,
  totalServices: 0,
  pagination: {
    current: 1,
    pageSize: 10,
  },
  fetchTrigger: false, // New field to track fetch trigger
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };
    case "SET_SERVICES":
      return {
        ...state,
        services: action.payload.services,
        totalServices: action.payload.totalServices,
      };
    case "SET_PAGINATION":
      return {
        ...state,
        pagination: {
          ...state.pagination,
          ...action.payload,
        },
        fetchTrigger: !state.fetchTrigger, // Trigger fetch on pagination change
      };
    default:
      return state;
  }
}

const ServicesField = ({ id }) => {
  const [state, dispatch] = useReducer(reducer, initialState);

  const fetchServices = async () => {
    dispatch({ type: "SET_LOADING", payload: true });
    try {
      const { current, pageSize } = state.pagination;
      const res = await AuthService.getAdminServices(id, current, pageSize);
      dispatch({
        type: "SET_SERVICES",
        payload: {
          services: res?.data?.services || [],
          totalServices: res?.data?.totalServices || 0,
        },
      });
    } catch (error) {
      console.error("Error fetching services:", error);
      dispatch({
        type: "SET_SERVICES",
        payload: { services: [], totalServices: 0 },
      });
      message.error("Ma'lumotlar topilmadi");
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  useEffect(() => {
    fetchServices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, state.fetchTrigger]); // Trigger only on ID change or fetchTrigger toggle

  const handleTableChange = (page, pageSize) => {
    dispatch({ type: "SET_PAGINATION", payload: { current: page, pageSize } });
  };

  const tableColumns = [
    {
      title: "Service",
      dataIndex: "service",
      render: (service) => <>{service?.name}</>,
    },
    {
      title: "Service description",
      dataIndex: "service",
      width: "30%",
      render: (description) => <>{description?.description}</>,
    },
    {
      title: "Granted",
      dataIndex: "grantedByAdmin",
      render: (granted) => (
        <>
          {granted?.first_name ? `${granted?.first_name} ${granted?.last_name}` : ""}
        </>
      ),
    },
    {
      title: "Created at",
      dataIndex: "createdAt",
      render: (createdAt) => <>{getDateString(createdAt)}</>,
      sorter: (a, b) => dayjs(a.createdAt).unix() - dayjs(b.createdAt).unix(),
    },
  ];

  return (
    <Card bodyStyle={{ padding: "0px" }}>
      <div className="table-responsive">
        <Table
          columns={tableColumns}
          dataSource={state.services}
          loading={state.loading}
          rowKey="id"
          pagination={{
            current: state.pagination.current,
            pageSize: state.pagination.pageSize,
            total: state.totalServices,
            showSizeChanger: true,
            pageSizeOptions: ["10", "20", "30"],
            onChange: handleTableChange,
          }}
        />
      </div>
    </Card>
  );
};

export default ServicesField;
