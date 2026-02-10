import React, { useEffect, useState } from "react";
import { Input, Row, Col, Card, Form, Spin, message } from "antd";
import InitiatorService from "services/InitiatorService";
import { useTranslation } from "react-i18next";

const GeneralField = ({ id }) => {
	const [loading, setLoading] = useState(true);
	const [initiatorData, setInitiatorData] = useState(null);
	const { t } = useTranslation();

	useEffect(() => {
		const fetchInitiatorData = async (id) => {
			console.log(id);
			try {
				setLoading(true);
				// Replace with your actual API endpoint
				const response = await InitiatorService.getById(id);
				console.log(response);
				console.log(response?.data?.initiator);
				setInitiatorData(response?.data?.initiator);
				if (response.status !== 200) throw new Error("Failed to fetch data");
			} catch (error) {
				message.error("Failed to load initiator data");
				console.error(error);
			} finally {
				setLoading(false);
			}
		};

		if (id) {
			fetchInitiatorData(id);
		}
	}, [id]);

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
				<Card>
					<Form
						layout="vertical"
						initialValues={initiatorData}
					>
						<Row gutter={16}>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="last_name"
									label={t("last_name")}
								>
									<Input
										value={initiatorData?.last_name}
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="first_name"
									label={t("first_name")}
								>
									<Input
										value={initiatorData?.first_name}
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={8}>
								<Form.Item
									name="father_name"
									label={t("father_name")}
								>
									<Input
										value={initiatorData?.father_name}
										readOnly
										className="w-100"
									/>
								</Form.Item>
							</Col>
							<Col xs={24} sm={24} md={12}>
								<Form.Item
									name="notes"
									label={t("notes")}
								>
									<Input
										value={initiatorData?.notes}
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
