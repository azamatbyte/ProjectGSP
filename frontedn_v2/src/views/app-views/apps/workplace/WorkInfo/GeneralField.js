import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Spin, message } from "antd";
import WorkPlaceService from "services/WorkPlaceService";
import { useTranslation } from "react-i18next";

const GeneralField = ({id}) => {
	const [loading, setLoading] = useState(true);
	const [workPlace, setWorkPlaceData] = useState(null);
	const { t } = useTranslation();

	useEffect(() => {
		const fetchInitiatorData = async (id) => {
			try {
				setLoading(true);
				const response = await WorkPlaceService.getById(id);
				setWorkPlaceData(response?.data?.workPlace);
				if (response.status!==200) throw new Error("Failed to fetch data");
			} catch (error) {
				message.error(t("failed_to_load_workplace_data"));
			} finally {
				setLoading(false);
			}
		};

		if (id) {
			fetchInitiatorData(id);
		}
	}, [id, t]);

	if (loading) {
		return (
			<div style={{ textAlign: "center", padding: "50px" }}>
				<Spin size="large" />
			</div>
		);
	}

	return (
		<Row gutter={16}>
			<Col xs={24} sm={24} md={17}>
				<Card title={t("basic_info")}>
					<Form
						layout="vertical"
						initialValues={workPlace}
					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={12}>
								<Form.Item 
									name="name" 
									label={t("name")}
								>
									<Input 
										value={workPlace?.name}
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
						</Row>
					</Form>
				</Card>
			</Col>
		</Row>
	);
};

export default GeneralField;
